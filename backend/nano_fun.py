"""
nano_fun.py - AR Designer Kit Gemini AI Service (Python)
Full Nano Banana (gemini-2.5-flash-image) and Nano Banana Pro (gemini-3-pro-image-preview) support

This module provides a comprehensive Python interface to Google's Gemini AI models,
with specialized support for the Nano Banana image generation models. It enables:

- Object recognition and room analysis
- Text-to-image and image-to-image generation
- Multi-turn conversational image editing
- Style transfer and variations
- Seamless texture generation
- Floor plan generation from photos
- Product recommendations with Google Search grounding
- High-resolution (4K) output
- Multi-reference image compositing (up to 14 images)

Models Available:
    - gemini-2.5-flash: Fast text and vision analysis
    - gemini-2.5-pro: Advanced reasoning and spatial analysis
    - gemini-2.5-flash-image (Nano Banana): Fast image generation/editing
    - gemini-3-pro-image-preview (Nano Banana Pro): Advanced image generation with thinking

Setup:
    pip install google-genai pillow
    export GEMINI_API_KEY="your-api-key"
    
Usage:
    from nano_fun import generate_image, edit_image, RoomEditingSession
    
    # Generate an image from text
    image, description = generate_image("A modern living room with plants")
    
    # Edit an existing image
    edited, desc = edit_image(image, "Make the walls blue")
    
    # Multi-turn editing session
    session = RoomEditingSession()
    img1, text1 = session.edit(room_photo, "Transform to modern style")
    img2, text2 = session.edit(None, "Make the sofa darker")
    
    # Run examples
    python nano_fun.py --demo

Author: AR Designer Kit Team
License: Copyright 2024
"""

from google import genai
from google.genai import types
from PIL import Image
from io import BytesIO
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Tuple
from enum import Enum
import base64
import json
import time

# ============================================================================
# Initialize Client
# ============================================================================

client = genai.Client()  # Picks up GEMINI_API_KEY from environment

# ============================================================================
# Models
# ============================================================================

class Models:
    """Available Gemini models for different tasks.
    
    Attributes:
        FLASH: Fast text and vision model (gemini-2.5-flash)
        PRO: Advanced reasoning model (gemini-2.5-pro)
        NANO_BANANA: Fast image generation model (gemini-2.5-flash-image)
        NANO_BANANA_PRO: Advanced image generation with thinking (gemini-3-pro-image-preview)
    """
    # Text + Vision (no image generation)
    FLASH = "gemini-2.5-flash"
    PRO = "gemini-2.5-pro"
    
    # Native Image Generation (Nano Banana)
    NANO_BANANA = "gemini-2.5-flash-image"           # Fast image gen/editing
    NANO_BANANA_PRO = "gemini-3-pro-image-preview"   # Advanced, thinking, 14 ref images

# ============================================================================
# Data Classes
# ============================================================================

@dataclass
class BoundingBox:
    """Normalized bounding box coordinates (0-1 range).
    
    Attributes:
        min_x: Left edge (0-1)
        min_y: Top edge (0-1)
        max_x: Right edge (0-1)
        max_y: Bottom edge (0-1)
    """
    min_x: float
    min_y: float
    max_x: float
    max_y: float

@dataclass
class RecognizedObject:
    """Detected object in an image with location and classification.
    
    Attributes:
        label: Object name (e.g., "sofa", "window", "wall")
        confidence: Detection confidence (0.0-1.0)
        bounding_box: Location in image
        category: Object category ('architectural', 'furniture', 'fixture', 'other')
    """
    label: str
    confidence: float
    bounding_box: BoundingBox
    category: str  # 'architectural', 'furniture', 'fixture', 'other'

@dataclass
class RoomDimensions:
    """Estimated room dimensions in meters.
    
    Attributes:
        estimated_width: Room width in meters
        estimated_length: Room length in meters
        estimated_height: Ceiling height in meters
    """
    estimated_width: float
    estimated_length: float
    estimated_height: float

@dataclass
class RoomAnalysis:
    """Comprehensive room analysis results.
    
    Attributes:
        room_type: Type of room (e.g., "living room", "bedroom")
        dimensions: Estimated room dimensions
        lighting_suggestions: List of lighting improvement suggestions
        style_recommendations: List of recommended design styles
        detected_features: List of notable architectural features
    """
    room_type: str
    dimensions: RoomDimensions
    lighting_suggestions: List[str]
    style_recommendations: List[str]
    detected_features: List[str]

@dataclass
class StyleVariation:
    """A style variation of a room design.
    
    Attributes:
        id: Unique identifier for this variation
        name: Human-readable name
        description: Detailed description of the style
        image: Generated PIL Image (optional)
    """
    id: str
    name: str
    description: str
    image: Optional[Image.Image] = None

@dataclass
class FloorPlan:
    """2D floor plan data extracted from room image.
    
    Attributes:
        walls: List of wall segments with start/end coordinates
        doors: List of door positions with width and angle
        windows: List of window positions with dimensions
        dimensions: Overall room dimensions in meters
    """
    walls: List[Dict[str, Any]]
    doors: List[Dict[str, Any]]
    windows: List[Dict[str, Any]]
    dimensions: Dict[str, float]

@dataclass
class ProductRecommendation:
    """Furniture or decor product recommendation.
    
    Attributes:
        name: Product name
        brand: Manufacturer or brand
        price_range: Price range string (e.g., "$500-$1000")
        retailer: Where to purchase
        fit_rationale: Why this product fits the room
        search_query: Search terms to find the product
    """
    name: str
    brand: str
    price_range: str
    retailer: str
    fit_rationale: str
    search_query: str

# ============================================================================
# Image Utilities
# ============================================================================

def load_image(path: str) -> Image.Image:
    """Load an image from file path.
    
    Args:
        path: File path to image
        
    Returns:
        PIL Image object
    """
    return Image.open(path)

def image_to_bytes(image: Image.Image, format: str = "PNG") -> bytes:
    """Convert PIL Image to bytes.
    
    Args:
        image: PIL Image to convert
        format: Output format (PNG, JPEG, etc.)
        
    Returns:
        Image data as bytes
    """
    buffer = BytesIO()
    image.save(buffer, format=format)
    return buffer.getvalue()

def bytes_to_image(data: bytes) -> Image.Image:
    """Convert bytes to PIL Image.
    
    Args:
        data: Image data as bytes
        
    Returns:
        PIL Image object
    """
    return Image.open(BytesIO(data))

def save_image(image: Image.Image, path: str):
    """Save PIL Image to file.
    
    Args:
        image: PIL Image to save
        path: Output file path
    """
    image.save(path)

# ============================================================================
# Object Recognition
# ============================================================================

def recognize_objects(
    image: Image.Image,
    min_confidence: float = 0.5
) -> List[RecognizedObject]:
    """Recognize objects in a room image using Gemini Vision.
    
    Detects architectural features (walls, doors, windows), furniture,
    fixtures, and other objects with bounding boxes and confidence scores.
    
    Args:
        image: PIL Image to analyze
        min_confidence: Minimum confidence threshold (0-1)
    
    Returns:
        List of recognized objects with bounding boxes and categories
        
    Example:
        >>> image = load_image("room.jpg")
        >>> objects = recognize_objects(image, min_confidence=0.7)
        >>> for obj in objects:
        ...     print(f"{obj.label}: {obj.confidence:.2f}")
    """
    prompt = """You are an expert architectural and interior design feature detector.
Analyze this room image and identify ALL visible objects and architectural features.

For each detected item, provide a JSON array with objects containing:
- label: specific name (e.g., "wall", "floor", "ceiling", "window", "door", "sofa", "table")
- confidence: 0.0 to 1.0 based on detection certainty
- bounding_box: {min_x, min_y, max_x, max_y} as normalized coordinates (0-1)
- category: one of "architectural", "furniture", "fixture", "other"

Categories:
- architectural: walls, floors, ceilings, columns, beams, stairs
- furniture: tables, chairs, sofas, beds, desks, shelves, cabinets
- fixture: windows, doors, outlets, switches, vents, built-in lighting
- other: plants, decorations, artwork, rugs, curtains

Return ONLY a valid JSON array."""

    response = client.models.generate_content(
        model=Models.FLASH,
        contents=[prompt, image],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    
    try:
        data = json.loads(response.text)
        objects = []
        for obj in data:
            if obj.get("confidence", 0) >= min_confidence:
                bbox = obj.get("bounding_box", {})
                objects.append(RecognizedObject(
                    label=obj.get("label", "unknown"),
                    confidence=obj.get("confidence", 0),
                    bounding_box=BoundingBox(
                        min_x=bbox.get("min_x", 0),
                        min_y=bbox.get("min_y", 0),
                        max_x=bbox.get("max_x", 1),
                        max_y=bbox.get("max_y", 1),
                    ),
                    category=obj.get("category", "other"),
                ))
        return objects
    except json.JSONDecodeError:
        print(f"Failed to parse response: {response.text}")
        return []

# ============================================================================
# Room Analysis
# ============================================================================

def analyze_room(image: Image.Image) -> RoomAnalysis:
    """Analyze a room image for design recommendations.
    
    Provides comprehensive analysis including room type, estimated dimensions,
    lighting suggestions, style recommendations, and detected features.
    
    Args:
        image: PIL Image of the room
    
    Returns:
        RoomAnalysis with type, dimensions, and recommendations
        
    Example:
        >>> image = load_image("living_room.jpg")
        >>> analysis = analyze_room(image)
        >>> print(f"Room: {analysis.room_type}")
        >>> print(f"Size: {analysis.dimensions.estimated_width}m x {analysis.dimensions.estimated_length}m")
        >>> print(f"Styles: {', '.join(analysis.style_recommendations)}")
    """
    prompt = """You are an expert interior designer and architect.
Analyze this room image and provide a JSON object with:

{
    "room_type": "living room/bedroom/kitchen/etc",
    "dimensions": {
        "estimated_width": <meters>,
        "estimated_length": <meters>,
        "estimated_height": <meters>
    },
    "lighting_suggestions": ["suggestion1", "suggestion2", ...],
    "style_recommendations": ["style1", "style2", ...],
    "detected_features": ["feature1", "feature2", ...]
}

Return ONLY valid JSON."""

    response = client.models.generate_content(
        model=Models.FLASH,
        contents=[prompt, image],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            thinking_config=types.ThinkingConfig(thinking_budget=128),
        ),
    )
    
    try:
        data = json.loads(response.text)
        dims = data.get("dimensions", {})
        return RoomAnalysis(
            room_type=data.get("room_type", "unknown"),
            dimensions=RoomDimensions(
                estimated_width=dims.get("estimated_width", 0),
                estimated_length=dims.get("estimated_length", 0),
                estimated_height=dims.get("estimated_height", 0),
            ),
            lighting_suggestions=data.get("lighting_suggestions", []),
            style_recommendations=data.get("style_recommendations", []),
            detected_features=data.get("detected_features", []),
        )
    except json.JSONDecodeError:
        print(f"Failed to parse response: {response.text}")
        return RoomAnalysis(
            room_type="unknown",
            dimensions=RoomDimensions(0, 0, 0),
            lighting_suggestions=[],
            style_recommendations=[],
            detected_features=[],
        )

# ============================================================================
# Image Generation (Text-to-Image)
# ============================================================================

def generate_image(
    prompt: str,
    aspect_ratio: str = "16:9",
    model: str = Models.NANO_BANANA,
) -> Tuple[Optional[Image.Image], str]:
    """Generate an image from a text prompt using Nano Banana.
    
    Creates a new image based on text description. Supports various aspect ratios
    and can use either the fast Nano Banana or higher-quality Nano Banana Pro model.
    
    Args:
        prompt: Text description of the image to generate
        aspect_ratio: Output aspect ratio ("1:1", "16:9", "9:16", "4:3", "3:4", etc.)
        model: NANO_BANANA (fast) or NANO_BANANA_PRO (quality)
    
    Returns:
        Tuple of (PIL Image or None, description text)
        
    Example:
        >>> image, desc = generate_image(
        ...     "A cozy bedroom with warm lighting and plants",
        ...     aspect_ratio="4:3"
        ... )
        >>> if image:
        ...     image.save("bedroom.png")
    """
    response = client.models.generate_content(
        model=model,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            image_config=types.ImageConfig(
                aspect_ratio=aspect_ratio,
            ),
        ),
    )
    
    image = None
    description = ""
    
    for part in response.parts:
        if part.text is not None:
            description = part.text
        elif part.inline_data is not None:
            image = part.as_image()
    
    return image, description

# ============================================================================
# Image Editing (Image-to-Image)
# ============================================================================

def edit_image(
    image: Image.Image,
    edit_prompt: str,
    aspect_ratio: str = "16:9",
    model: str = Models.NANO_BANANA,
) -> Tuple[Optional[Image.Image], str]:
    """Edit an existing image based on a text prompt.
    
    Modifies an input image according to text instructions while preserving
    the overall structure and composition.
    
    Args:
        image: Source PIL Image to edit
        edit_prompt: Description of desired changes
        aspect_ratio: Output aspect ratio
        model: NANO_BANANA (fast) or NANO_BANANA_PRO (quality)
    
    Returns:
        Tuple of (edited PIL Image or None, description text)
        
    Example:
        >>> original = load_image("room.jpg")
        >>> edited, desc = edit_image(
        ...     original,
        ...     "Change the wall color to sage green"
        ... )
        >>> if edited:
        ...     edited.save("room_edited.jpg")
    """
    response = client.models.generate_content(
        model=model,
        contents=[image, edit_prompt],
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            image_config=types.ImageConfig(
                aspect_ratio=aspect_ratio,
            ),
        ),
    )
    
    result_image = None
    description = ""
    
    for part in response.parts:
        if part.text is not None:
            description = part.text
        elif part.inline_data is not None:
            result_image = part.as_image()
    
    return result_image, description

# ============================================================================
# Room Style Generation
# ============================================================================

def generate_room_style(
    room_image: Image.Image,
    style_prompt: str,
    aspect_ratio: str = "16:9",
    resolution: str = "2K",
    use_pro: bool = False,
) -> Tuple[Optional[Image.Image], str]:
    """Transform a room image with a new interior design style.
    
    Applies a complete style transformation to a room photo while preserving
    the basic structure and layout. Ideal for visualizing design concepts.
    
    Args:
        room_image: Original room photo
        style_prompt: Desired style (e.g., "modern minimalist", "bohemian", "scandinavian")
        aspect_ratio: Output aspect ratio
        resolution: "1K", "2K", or "4K" (Pro model only)
        use_pro: Use Nano Banana Pro for higher quality
    
    Returns:
        Tuple of (styled room image, description)
        
    Example:
        >>> room = load_image("living_room.jpg")
        >>> styled, desc = generate_room_style(
        ...     room,
        ...     "Scandinavian minimalist with natural wood and white walls",
        ...     resolution="2K",
        ...     use_pro=True
        ... )
        >>> if styled:
        ...     styled.save("living_room_scandinavian.jpg")
    """
    enhanced_prompt = f"""Transform this room image according to the following style:
{style_prompt}

Important guidelines:
- Preserve the room's basic structure and layout
- Change materials, colors, textures, and decor to match the style
- Maintain realistic lighting that matches the new materials
- Keep the same camera angle and perspective
- Make it look like a professional interior design visualization"""

    model = Models.NANO_BANANA_PRO if use_pro else Models.NANO_BANANA
    
    config_dict = {
        "response_modalities": ["TEXT", "IMAGE"],
        "image_config": types.ImageConfig(
            aspect_ratio=aspect_ratio,
        ),
    }
    
    # Add resolution for Pro model
    if use_pro:
        config_dict["image_config"] = types.ImageConfig(
            aspect_ratio=aspect_ratio,
            image_size=resolution,
        )
    
    response = client.models.generate_content(
        model=model,
        contents=[room_image, enhanced_prompt],
        config=types.GenerateContentConfig(**config_dict),
    )
    
    result_image = None
    description = ""
    
    for part in response.parts:
        # Skip thinking parts (Pro model)
        if hasattr(part, 'thought') and part.thought:
            continue
        if part.text is not None:
            description = part.text
        elif part.inline_data is not None:
            result_image = part.as_image()
    
    return result_image, description

# ============================================================================
# Style Variations
# ============================================================================

STYLE_MODIFIERS = [
    {"id": "warm", "name": "Warm & Cozy", "modifier": "with warm earth tones, soft textures, and ambient lighting"},
    {"id": "cool", "name": "Cool & Modern", "modifier": "with cool tones, clean lines, and minimalist aesthetic"},
    {"id": "natural", "name": "Natural & Organic", "modifier": "with natural materials, plants, and earthy elements"},
    {"id": "luxurious", "name": "Luxurious & Elegant", "modifier": "with premium materials, rich colors, and sophisticated details"},
    {"id": "bright", "name": "Bright & Airy", "modifier": "with light colors, open feel, and maximum natural light"},
]

def generate_style_variations(
    room_image: Image.Image,
    base_style: str,
    num_variations: int = 3,
    resolution: str = "2K",
) -> List[StyleVariation]:
    """Generate multiple style variations of a room.
    
    Creates several different interpretations of a base style, each with
    unique characteristics (warm/cool tones, natural/luxurious, etc.).
    
    Args:
        room_image: Original room photo
        base_style: Base style to apply (e.g., "modern", "rustic")
        num_variations: Number of variations to generate (1-5)
        resolution: Output resolution
    
    Returns:
        List of StyleVariation objects with images
        
    Example:
        >>> room = load_image("bedroom.jpg")
        >>> variations = generate_style_variations(
        ...     room,
        ...     "modern",
        ...     num_variations=3,
        ...     resolution="2K"
        ... )
        >>> for i, var in enumerate(variations):
        ...     var.image.save(f"bedroom_{var.id}.jpg")
        ...     print(f"{var.name}: {var.description}")
    """
    variations = []
    selected_modifiers = STYLE_MODIFIERS[:min(num_variations, 5)]
    
    for modifier in selected_modifiers:
        full_prompt = f"""Transform this room with a {base_style} style, {modifier['modifier']}.

Create a professional interior design visualization that:
- Preserves the room's structure
- Applies the style consistently throughout
- Looks realistic and achievable"""

        try:
            response = client.models.generate_content(
                model=Models.NANO_BANANA_PRO,
                contents=[room_image, full_prompt],
                config=types.GenerateContentConfig(
                    response_modalities=["TEXT", "IMAGE"],
                    image_config=types.ImageConfig(
                        aspect_ratio="16:9",
                        image_size=resolution,
                    ),
                ),
            )
            
            result_image = None
            description = ""
            
            for part in response.parts:
                if hasattr(part, 'thought') and part.thought:
                    continue
                if part.text is not None:
                    description = part.text
                elif part.inline_data is not None:
                    result_image = part.as_image()
            
            if result_image:
                variations.append(StyleVariation(
                    id=modifier["id"],
                    name=modifier["name"],
                    description=description or f"{base_style} {modifier['modifier']}",
                    image=result_image,
                ))
                
        except Exception as e:
            print(f"Failed to generate variation {modifier['id']}: {e}")
    
    return variations

# ============================================================================
# Multi-Turn Chat Editing (Iterative Refinement)
# ============================================================================

class RoomEditingSession:
    """Chat-based room editing session for iterative refinement.
    
    Maintains conversation context across multiple edits, allowing for
    natural back-and-forth refinement of room designs without re-uploading
    images each time.
    
    Attributes:
        chat: The underlying chat session
        history: List of edit operations performed
    
    Example:
        >>> session = RoomEditingSession()
        >>> 
        >>> # First edit with initial image
        >>> img1, text1 = session.edit(room_image, "Transform to modern style")
        >>> 
        >>> # Continue editing (no need to re-upload image)
        >>> img2, text2 = session.edit(None, "Make the sofa blue instead")
        >>> 
        >>> # Add new reference image
        >>> img3, text3 = session.edit(reference_img, "Apply the color scheme from this image")
    """
    
    def __init__(self, enable_search: bool = True):
        """Create a new editing session.
        
        Args:
            enable_search: Enable Google Search grounding for product suggestions
        """
        config = types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
        )
        if enable_search:
            config = types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                tools=[{"google_search": {}}],
            )
        
        self.chat = client.chats.create(
            model=Models.NANO_BANANA_PRO,
            config=config,
        )
        self.history = []
    
    def edit(
        self,
        image: Optional[Image.Image],
        prompt: str,
        aspect_ratio: Optional[str] = None,
        resolution: Optional[str] = None,
    ) -> Tuple[Optional[Image.Image], str]:
        """Send an edit request to the session.
        
        Args:
            image: Optional new image to include (or None to continue editing)
            prompt: Edit instructions
            aspect_ratio: Optional output aspect ratio
            resolution: Optional output resolution ("1K", "2K", "4K")
        
        Returns:
            Tuple of (result image or None, response text)
        """
        # Build message parts
        parts = []
        if image is not None:
            parts.append(image)
        parts.append(prompt)
        
        # Build config if needed
        config = None
        if aspect_ratio or resolution:
            image_config_dict = {}
            if aspect_ratio:
                image_config_dict["aspect_ratio"] = aspect_ratio
            if resolution:
                image_config_dict["image_size"] = resolution
            config = types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=types.ImageConfig(**image_config_dict),
            )
        
        # Send message
        if config:
            response = self.chat.send_message(parts, config=config)
        else:
            response = self.chat.send_message(parts)
        
        result_image = None
        text = ""
        
        for part in response.parts:
            if hasattr(part, 'thought') and part.thought:
                continue
            if part.text is not None:
                text += part.text
            elif part.inline_data is not None:
                result_image = part.as_image()
        
        self.history.append({"prompt": prompt, "has_image": image is not None})
        
        return result_image, text
    
    def get_history(self):
        """Get the chat history.
        
        Returns:
            List of chat messages and responses
        """
        return self.chat.get_history()

# ============================================================================
# Multi-Reference Image Compositing (Nano Banana Pro)
# ============================================================================

def composite_with_references(
    prompt: str,
    reference_images: List[Image.Image],
    aspect_ratio: str = "16:9",
    resolution: str = "2K",
) -> Tuple[Optional[Image.Image], str]:
    """Generate an image using multiple reference images (up to 14).
    
    Powerful for combining elements from multiple sources, maintaining
    character consistency, or applying complex style transfers.
    
    Args:
        prompt: Description of what to create
        reference_images: List of up to 14 reference images
        aspect_ratio: Output aspect ratio
        resolution: Output resolution
    
    Returns:
        Tuple of (generated image, description)
        
    Example:
        >>> # Combine style from multiple rooms
        >>> refs = [load_image(f"ref{i}.jpg") for i in range(3)]
        >>> result, desc = composite_with_references(
        ...     "Create a living room combining the color scheme from image 1, "
        ...     "furniture style from image 2, and lighting from image 3",
        ...     refs,
        ...     resolution="2K"
        ... )
    """
    if len(reference_images) > 14:
        print("Warning: Maximum 14 reference images allowed, truncating")
        reference_images = reference_images[:14]
    
    # Build contents: prompt first, then all images
    contents = [prompt] + reference_images
    
    response = client.models.generate_content(
        model=Models.NANO_BANANA_PRO,
        contents=contents,
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            image_config=types.ImageConfig(
                aspect_ratio=aspect_ratio,
                image_size=resolution,
            ),
        ),
    )
    
    result_image = None
    description = ""
    
    for part in response.parts:
        if hasattr(part, 'thought') and part.thought:
            continue
        if part.text is not None:
            description = part.text
        elif part.inline_data is not None:
            result_image = part.as_image()
    
    return result_image, description

# ============================================================================
# Seamless Texture Generation
# ============================================================================

def generate_seamless_texture(
    material_description: str,
    resolution: str = "2K",
) -> Optional[Image.Image]:
    """
    Generate a seamless tileable texture.
    
    Args:
        material_description: Description of the material (e.g., "oak hardwood floor", "white marble")
        resolution: "1K", "2K", or "4K" (requires Pro model)
    
    Returns:
        PIL Image of the seamless texture
    """
    prompt = f"""Create a seamless tileable texture for: {material_description}

Requirements:
- Must be perfectly tileable (edges match when repeated)
- High detail and realistic appearance
- Suitable for 3D rendering and AR visualization
- Professional quality interior design material
- Even lighting with no visible seams
- Square format"""

    # Use Pro model for resolution control, basic model otherwise
    if resolution in ["2K", "4K"]:
        # Pro model supports image_size
        response = client.models.generate_content(
            model=Models.NANO_BANANA_PRO,
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],  # Always include TEXT
                image_config=types.ImageConfig(
                    aspect_ratio="1:1",
                    image_size=resolution,
                ),
            ),
        )
    else:
        # Basic model - no image_size parameter
        response = client.models.generate_content(
            model=Models.NANO_BANANA,
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],  # Always include TEXT
                image_config=types.ImageConfig(
                    aspect_ratio="1:1",
                ),
            ),
        )
    
    for part in response.parts:
        # Skip thinking parts
        if hasattr(part, 'thought') and part.thought:
            continue
        if part.inline_data is not None:
            return part.as_image()
    
    return None

# ============================================================================
# Floor Plan Generation
# ============================================================================

def generate_floor_plan(
    room_image: Image.Image,
    recognized_objects: Optional[List[RecognizedObject]] = None,
) -> FloorPlan:
    """
    Generate a 2D floor plan from a room image.
    
    Args:
        room_image: Photo of the room
        recognized_objects: Optional pre-detected objects for context
    
    Returns:
        FloorPlan with walls, doors, windows, and dimensions
    """
    context = ""
    if recognized_objects:
        architectural = [obj for obj in recognized_objects 
                        if any(x in obj.label for x in ['wall', 'door', 'window', 'floor'])]
        context = "Detected features: " + ", ".join(
            f"{obj.label} at ({obj.bounding_box.min_x:.2f}, {obj.bounding_box.min_y:.2f})"
            for obj in architectural
        )

    prompt = f"""You are an expert architect analyzing a room image to generate a 2D floor plan.

{context}

Based on this image, generate a floor plan as JSON:
{{
    "walls": [{{"start": {{"x": 0, "y": 0}}, "end": {{"x": 5, "y": 0}}}}, ...],
    "doors": [{{"position": {{"x": 2, "y": 0}}, "width": 0.9, "angle": 90}}, ...],
    "windows": [{{"position": {{"x": 3, "y": 0}}, "width": 1.2, "height": 1.5}}, ...],
    "dimensions": {{"width": 5.0, "length": 4.0}}
}}

All measurements in meters. Return ONLY valid JSON."""

    response = client.models.generate_content(
        model=Models.PRO,
        contents=[room_image, prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            thinking_config=types.ThinkingConfig(thinking_budget=256),
        ),
    )
    
    try:
        data = json.loads(response.text)
        return FloorPlan(
            walls=data.get("walls", []),
            doors=data.get("doors", []),
            windows=data.get("windows", []),
            dimensions=data.get("dimensions", {"width": 0, "length": 0}),
        )
    except json.JSONDecodeError:
        print(f"Failed to parse floor plan: {response.text}")
        return FloorPlan([], [], [], {"width": 0, "length": 0})

# ============================================================================
# Product Recommendations with Google Search
# ============================================================================

def get_product_recommendations(
    room_analysis: RoomAnalysis,
    budget: str = "medium",
    style: Optional[str] = None,
    priorities: Optional[List[str]] = None,
) -> List[ProductRecommendation]:
    """
    Get furniture and decor recommendations using Google Search grounding.
    
    Args:
        room_analysis: Analysis from analyze_room()
        budget: "low", "medium", "high", or "luxury"
        style: Preferred style override
        priorities: List of priorities (e.g., ["comfort", "durability"])
    
    Returns:
        List of product recommendations with real products
    """
    budget_ranges = {
        "low": "budget-friendly under $500",
        "medium": "mid-range $500-2000",
        "high": "premium $2000-5000",
        "luxury": "luxury over $5000",
    }
    
    prompt = f"""Based on this room analysis, recommend specific furniture and decor products.

Room Type: {room_analysis.room_type}
Room Dimensions: {room_analysis.dimensions.estimated_width}m x {room_analysis.dimensions.estimated_length}m
Style Recommendations: {', '.join(room_analysis.style_recommendations)}
User Preferred Style: {style or 'Not specified'}
Budget Range: {budget_ranges.get(budget, 'Not specified')}
Priorities: {', '.join(priorities) if priorities else 'Not specified'}

Search for REAL products currently available. Provide 5-8 recommendations as JSON array:
[
    {{
        "name": "Product Name",
        "brand": "Brand",
        "price_range": "$X - $Y",
        "retailer": "Store Name",
        "fit_rationale": "Why this fits",
        "search_query": "search terms"
    }}
]

Return ONLY valid JSON array."""

    response = client.models.generate_content(
        model=Models.NANO_BANANA_PRO,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_modalities=["TEXT"],
            tools=[{"google_search": {}}],
            response_mime_type="application/json",
        ),
    )
    
    try:
        data = json.loads(response.text)
        return [
            ProductRecommendation(
                name=item.get("name", ""),
                brand=item.get("brand", ""),
                price_range=item.get("price_range", ""),
                retailer=item.get("retailer", ""),
                fit_rationale=item.get("fit_rationale", ""),
                search_query=item.get("search_query", ""),
            )
            for item in data
        ]
    except json.JSONDecodeError:
        print(f"Failed to parse recommendations: {response.text}")
        return []

# ============================================================================
# Grounded Image Generation (with Google Search)
# ============================================================================

def generate_grounded_image(
    prompt: str,
    aspect_ratio: str = "16:9",
    resolution: str = "2K",
) -> Tuple[Optional[Image.Image], str, List[str]]:
    """
    Generate an image using Google Search for real-time information.
    
    Useful for:
    - Weather visualizations
    - Current events graphics
    - Data-driven infographics
    
    Args:
        prompt: Description including real-time data needs
        aspect_ratio: Output aspect ratio
        resolution: Output resolution
    
    Returns:
        Tuple of (image, description, search_queries used)
    """
    response = client.models.generate_content(
        model=Models.NANO_BANANA_PRO,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            image_config=types.ImageConfig(
                aspect_ratio=aspect_ratio,
                image_size=resolution,
            ),
            tools=[{"google_search": {}}],
        ),
    )
    
    result_image = None
    description = ""
    search_queries = []
    
    for part in response.parts:
        if hasattr(part, 'thought') and part.thought:
            continue
        if part.text is not None:
            description = part.text
        elif part.inline_data is not None:
            result_image = part.as_image()
    
    # Extract search queries from grounding metadata if available
    if response.candidates and response.candidates[0].grounding_metadata:
        meta = response.candidates[0].grounding_metadata
        if hasattr(meta, 'web_search_queries'):
            search_queries = meta.web_search_queries or []
    
    return result_image, description, search_queries

# ============================================================================
# High-Resolution Output (4K)
# ============================================================================

def generate_4k_image(
    prompt: str,
    aspect_ratio: str = "16:9",
    input_image: Optional[Image.Image] = None,
) -> Tuple[Optional[Image.Image], str]:
    """
    Generate a 4K resolution image (Nano Banana Pro only).
    
    Args:
        prompt: Description or edit instructions
        aspect_ratio: Output aspect ratio
        input_image: Optional input image for editing
    
    Returns:
        Tuple of (4K image, description)
    """
    contents = [input_image, prompt] if input_image else [prompt]
    
    response = client.models.generate_content(
        model=Models.NANO_BANANA_PRO,
        contents=contents,
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            image_config=types.ImageConfig(
                aspect_ratio=aspect_ratio,
                image_size="4K",
            ),
        ),
    )
    
    result_image = None
    description = ""
    
    for part in response.parts:
        if hasattr(part, 'thought') and part.thought:
            continue
        if part.text is not None:
            description = part.text
        elif part.inline_data is not None:
            result_image = part.as_image()
    
    return result_image, description

# ============================================================================
# Examples / Demo
# ============================================================================

def run_examples():
    """Run example demonstrations of all features."""
    img, desc = generate_image("modern kitchen with marble counters")
    img.save("kitchen.png")

    room = load_image("pics/demo_text_to_image.png")
    styled, _ = generate_room_style(room, "scandinavian minimalist with natural wood and white walls")
    styled.save("styled_room.png")

    session = RoomEditingSession()

    # Multi-turn editing session
    session = RoomEditingSession()
    img1, _ = session.edit(room, "Transform to industrial loft style")
    print(f"✓ Generated image saved to styled_room.png: {img1} {_}")
    img2, _ = session.edit(None, "Add exposed brick on the main wall")
    print(f"✓ Generated image saved to styled_room.png: {img2} {_}")
    img3, _ = session.edit(None, "Make the lighting warmer")
    print(f"✓ Generated image saved to styled_room.png: {img3} {_}")

    print("=" * 60)
    print("Gemini AI - Nano Banana Feature Demos")
    print("=" * 60)
    
    # 1. Text-to-Image Generation
    print("\n1. Text-to-Image Generation")
    print("-" * 40)
    image, desc = generate_image(
        "A modern minimalist living room with floor-to-ceiling windows, "
        "a white sectional sofa, and indoor plants. Natural daylight."
    )
    if image:
        image.save("demo_text_to_image.png")
        print(f"✓ Generated image saved to demo_text_to_image.png")
        print(f"  Description: {desc[:100]}...")
    
    # 2. Seamless Texture
    print("\n2. Seamless Texture Generation")
    print("-" * 40)
    texture = generate_seamless_texture("light oak hardwood flooring with natural grain")
    if texture:
        texture.save("demo_texture.png")
        print("✓ Generated texture saved to demo_texture.png")
    
    # 3. Grounded Image (with search)
    print("\n3. Grounded Image Generation (with Google Search)")
    print("-" * 40)
    grounded_img, grounded_desc, queries = generate_grounded_image(
        "Create a stylish infographic showing today's weather forecast for San Francisco"
    )
    if grounded_img:
        grounded_img.save("demo_grounded.png")
        print(f"✓ Generated grounded image saved to demo_grounded.png")
        print(f"  Search queries used: {queries}")
    
    print("\n" + "=" * 60)
    print("Demo complete! Check the generated files.")
    print("=" * 60)

# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    print("""
╔══════════════════════════════════════════════════════════════╗
║  Gemini AI - Nano Banana Python Module                       ║
║                                                              ║
║  Models:                                                     ║
║  • gemini-2.5-flash-image (Nano Banana) - Fast               ║
║  • gemini-3-pro-image-preview (Nano Banana Pro) - Quality    ║
║                                                              ║
║  Features:                                                   ║
║  • Text-to-Image generation                                  ║
║  • Image editing and style transfer                          ║
║  • Multi-turn chat editing                                   ║
║  • Up to 14 reference image compositing                      ║
║  • Google Search grounding                                   ║
║  • 4K resolution output                                      ║
║  • Seamless texture generation                               ║
║  • Room analysis and floor plans                             ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    # Check if API key is set
    import os
    if not os.environ.get("GEMINI_API_KEY"):
        print("⚠️  Set GEMINI_API_KEY environment variable first!")
        print("   export GEMINI_API_KEY='your-api-key'")
    else:
        print("✓ GEMINI_API_KEY found")
        print("\nRun examples with: python gemini_ai.py --demo")
        
        import sys
        if "--demo" in sys.argv:
            run_examples()






