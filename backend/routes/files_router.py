from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import os
import httpx
import json
from typing import List, Optional # Added Optional
from pydantic import BaseModel

files_router = APIRouter()
OPEN_UPLOAD_API_URL = "https://open-upload.api.gabrielmalek.com"
API_KEY = os.getenv("OPEN_UPLOAD_API_KEY")

# Removed unused FileUploadRequest model

@files_router.get("/list")
async def list_files(): # Renamed function for clarity
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")
    try:
        headers = {"X-API-Key": API_KEY}
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{OPEN_UPLOAD_API_URL}/api/v1/files/list",
                headers=headers
            )
            response.raise_for_status() # Raise exception for non-2xx status codes
            return JSONResponse(response.json())

    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"OpenUpload API error: {e.response.text}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@files_router.get("/{file_id}") # Changed path parameter name
async def get_file(file_id: str): # Changed function parameter name
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")
    try:
        headers = {"X-API-Key": API_KEY}
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{OPEN_UPLOAD_API_URL}/files/{file_id}",  # GET endpoint stays as is
                headers=headers
            )
            response.raise_for_status()
            return JSONResponse(response.json())

    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"OpenUpload API error: {e.response.text}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@files_router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")
    try:
        # No need to validate file type here, the API might handle it or requirements might change
        
        headers = {"X-API-Key": API_KEY}
        
        # Read file content
        file_content = await file.read()
        
        # Format the file with filename and content type
        files = {
            'file': (file.filename, file_content, file.content_type)
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OPEN_UPLOAD_API_URL}/api/v1/files/upload",
                headers=headers,
                files=files  # This sends as multipart/form-data like curl -F
            )
            response.raise_for_status()
            
            # Assuming the API returns JSON with file details, including an ID or URL
            # Adjust based on actual API response structure if needed
            upload_data = response.json()
            
            # Example: Return the file ID or URL if available in the response
            # Modify this part based on the actual response structure
            file_id = upload_data.get("id") or upload_data.get("file_id")
            file_url = f"{OPEN_UPLOAD_API_URL}/files/{file_id}"

            if file_id:
                 return JSONResponse({"id": file_id, "url": file_url}) # Return ID and URL
            elif file_url:
                 return JSONResponse({"url": file_url}) # Fallback to URL if ID is not present
            else:
                 # Return the whole response if specific fields aren't found
                 return JSONResponse(upload_data)

    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"OpenUpload API error: {e.response.text}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@files_router.delete("/{file_id}")
async def delete_file(file_id: str):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")
    try:
        headers = {"X-API-Key": API_KEY}
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{OPEN_UPLOAD_API_URL}/api/v1/files/{file_id}",
                headers=headers
            )
            response.raise_for_status()
            # Return success message or status code
            return JSONResponse(content={"message": "File deleted successfully"}, status_code=200)

    except httpx.HTTPStatusError as e:
        # Handle specific case where file might not be found (e.g., 404)
        if e.response.status_code == 404:
             raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"OpenUpload API error: {e.response.text}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
