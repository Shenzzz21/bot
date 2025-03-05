from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from app.utils import initialize_chain, query_chain, audio_to_text
import os
import uvicorn
from pydantic import BaseModel
from fastapi.responses import JSONResponse
import tempfile
from gtts import gTTS
from io import BytesIO
import logging
import base64
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

class QueryRequest(BaseModel):
    question: str

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

greetings = ["hello", "hi", "hey", "greetings", "good morning", "good evening"]

# @app.on_event("startup")
# async def startup_event():
#     global chain
#     # Initialize the chain once during application startup
chain = initialize_chain()

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/query")
async def query(request: QueryRequest):
    user_question = request.question.lower().strip()
    if any(greeting in user_question for greeting in greetings):
        return {"answer": "Hello! How can I assist you today?"}

    response = query_chain(chain, request.question)
    return {"answer": response}

@app.post("/queryaudio")
async def get_audio(request: Request):
    '''
    Function -> gets the input from the user as audio, converts it into text, and gives the response in audio
    '''
    try:
        # Get the audio file from the request form
        form = await request.form()
        audio_file = form["audio"].file
        logging.info("Received audio file from user.")

        # Save the file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_audio:
            temp_audio.write(audio_file.read())
            temp_audio_path = temp_audio.name

        # Convert the audio to text using the audio_to_text function
        query_text = audio_to_text(temp_audio_path)
        logging.info(f"Converted audio to text: {query_text}")
        
        # Delete the temporary audio file
        os.unlink(temp_audio_path)

        if not query:
            return JSONResponse(content={"error": "Could not understand the audio"}, status_code=400)

        # Process the query using your chain (conversation model)
        response = query_chain(chain, query_text)
        logging.info(f"Chain response: {response}")
        text_response = response

        # Convert the text response to speech (audio)
        tts = gTTS(text=text_response, lang='en')
        audio_io = BytesIO()
        tts.write_to_fp(audio_io)
        audio_io.seek(0)
    
        # Encode the audio response as base64
        audio_base64 = base64.b64encode(audio_io.read()).decode()
        # audio_base64 = base64.b64encode(audio_io.getvalue()).decode("utf-8")
        
        return JSONResponse(content={
            'response': text_response, 
            'query': query_text,
            'audio_response': audio_base64
        })

    except Exception as e:
        logging.error(f'Error processing audio: {str(e)}')
        return JSONResponse(content={'error': str(e)}, status_code=500)
    
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)