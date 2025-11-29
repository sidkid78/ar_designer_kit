from google import genai 
from google.genai import types 

client = genai.Client()

# Send the room scan image 
response = client.models.generate_content(
    model='gemini-2.5-flash',
    contents=[
        scan_image,
        """Identify all architectural features in this room scan:
        - Windows (with bounding boxes)
        - Doors (with bounding boxes)
        - Electrical outlets 
        - Light fixtures 
        Return as JSON with label, confidence, and box_2d coordinates."""
    ],
    config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_budget=0),
        response_mime_type='application/json'
    )
)

