from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from predict import LeukemiaPredictor
import os

app = FastAPI(
    title="Leukemia Classification API",
    description="API for classifying Leukemia in microscopic images using a custom CvT model.",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Global variable to hold the predictor instance
leukemia_predictor: LeukemiaPredictor = None

@app.on_event("startup")
async def startup_event():
    """
    Load the model when the FastAPI application starts.
    """
    global leukemia_predictor
    model_path = os.path.join(os.path.dirname(__file__), "models", "model_weights.pth")
    if not os.path.exists(model_path):
        raise RuntimeError(f"Model weights not found at {model_path}. Please ensure the 'models' directory and 'model_weights.pth' exist.")
    try:
        leukemia_predictor = LeukemiaPredictor(model_path=model_path)
        print("Model loaded successfully!")
    except Exception as e:
        print(f"Error loading model: {e}")
        raise HTTPException(status_code=500, detail=f"Could not load model: {e}")


@app.get("/")
async def read_root():
    return {"message": "Welcome to the Leukemia Classification API! Visit /docs for API documentation."}

@app.post("/predict")
async def predict_leukemia(file: UploadFile = File(...)):
    """
    Predicts whether an uploaded microscopic image shows signs of Leukemia (ALL) or is healthy (HEM).

    - **file**: Upload your image in .bmp, .jpeg, or .png format.
    """
    if not leukemia_predictor:
        raise HTTPException(status_code=503, detail="Model not loaded yet. Please try again in a moment.")

    allowed_content_types = ["image/bmp", "image/jpeg", "image/png"]
    if file.content_type not in allowed_content_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Only {', '.join(allowed_content_types)} are allowed."
        )

    try:
        image_bytes = await file.read()
        prediction_result = leukemia_predictor.predict_image(image_bytes)

        if "error" in prediction_result:
            raise HTTPException(status_code=500, detail=prediction_result["error"])

        return JSONResponse(content=prediction_result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
    

# usgage : uvicorn main:app --reload
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")

    # To run the server, use the command:
    # uvicorn main:app --reload