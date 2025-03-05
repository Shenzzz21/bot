from langchain_huggingface import HuggingFaceEmbeddings, HuggingFaceEndpoint
from langchain_chroma import Chroma
from langchain.chains import RetrievalQA
from langchain_community.document_loaders import PyPDFLoader   
from langchain.text_splitter import CharacterTextSplitter
import os
from dotenv import load_dotenv
import speech_recognition as sr

load_dotenv()

def create_embeddings_and_store():
    """
    Function to extract documents, chunk them, generate embeddings, and store them in Chroma DB.
    This function is executed only if embeddings don't already exist in the DB.
    """
    hf_api_token = os.getenv("HF_API_TOKEN")

    if not hf_api_token:
        raise ValueError("Hugging Face API token is missing in .env file")
    print(hf_api_token)
    pdf_folder_path = './research_papers'
    
    # List to store all loaded documents
    documents = []

    # Iterate through the files in the directory
    for file in os.listdir(pdf_folder_path):
        if file.endswith(".pdf"):
            pdf_path = os.path.join(pdf_folder_path, file) 
            try:
                loader = PyPDFLoader(pdf_path)
                documents.extend(loader.load())
            except Exception as e:
                print(f"Error processing file {file}: {e}")
    
    print(f"Total documents loaded: {len(documents)}")

    # Split text into chunks for each PDF
    text_splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=0)
    split_documents = text_splitter.split_documents(documents)

    # Generate embeddings using HuggingFace embeddings
    embedding_model = HuggingFaceEmbeddings()

    # Create a Chroma vector store
    vectorstore = Chroma(embedding_function=embedding_model, persist_directory="./db")

    if len(vectorstore.get()) == 0:
        vectorstore.add_documents(split_documents)  
        print(f"Added {len(split_documents)} documents to the vectorstore.")
    else:
        print("Embeddings already exist in the vector store, skipping re-processing.")

    return vectorstore


def initialize_chain():    
    """
    Initialize the RetrievalQA chain using Chroma vector store and Hugging Face model
    """
    hf_api_token = os.getenv("HF_API_TOKEN")
    print(hf_api_token)
    
    if not hf_api_token:
        raise ValueError("Hugging Face API token is missing in .env file")

    # Initialize the LLM
    llm = HuggingFaceEndpoint(
        repo_id="mistralai/Mistral-7B-Instruct-v0.2", 
        temperature=0.1, 
        max_length=512,
        api_key=hf_api_token  
    )

    # Create the Chroma vector store
    vectorstore = create_embeddings_and_store() 

    chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=vectorstore.as_retriever(), 
        input_key="question"
    )

    return chain


def query_chain(chain, question):
    print("Generating response...")
    return chain.run(question)


def audio_to_text(audio_file):
    recognizer = sr.Recognizer()
    
    with sr.AudioFile(audio_file) as source:
        audio = recognizer.record(source)
    try:
        text = recognizer.recognize_google(audio)
        return text
    except sr.UnknownValueError:
        return "Speech recognition could not understand the audio"
    except sr.RequestError as e:
        return f"Could not request results from speech recognition service; {e}"
