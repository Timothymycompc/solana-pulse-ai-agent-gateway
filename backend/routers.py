# FastAPI Backend
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

router = APIRouter()

class TextPayload(BaseModel):
    text: str

class CosinePayload(BaseModel):
    vector_a: list[float]
    vector_b: list[float]

class ChunkPayload(BaseModel):
    document: str
    chunk_size: int = 500
    overlap: int = 50

class FlattenPayload(BaseModel):
    nested_json: dict

class DeduplicatePayload(BaseModel):
    items: list[str]

@router.post("/ml/vectorize-text")
async def vectorize_text(body: TextPayload, x_rapidapi_key: str = Header(None, alias="X-RapidAPI-Key")):
    if not x_rapidapi_key:
        raise HTTPException(status_code=401, detail="Unauthorized. Missing X-RapidAPI-Key.")
    
    mock_vector = [round(hash(body.text + str(i)) % 100 / 100.0, 4) for i in range(8)]
    return {
        "dimensions": len(mock_vector),
        "embedding": mock_vector,
        "token_count": len(body.text.split())
    }

@router.post("/ml/cosine-similarity")
async def cosine_similarity(body: CosinePayload, x_rapidapi_key: str = Header(None, alias="X-RapidAPI-Key")):
    if not x_rapidapi_key:
        raise HTTPException(status_code=401, detail="Unauthorized. Missing X-RapidAPI-Key.")
    
    if len(body.vector_a) != len(body.vector_b):
        raise HTTPException(status_code=400, detail="Vector dimensions must match.")
        
    dot_product = sum(a * b for a, b in zip(body.vector_a, body.vector_b))
    norm_a = sum(a * a for a in body.vector_a) ** 0.5
    norm_b = sum(b * b for b in body.vector_b) ** 0.5
    
    similarity = dot_product / (norm_a * norm_b) if norm_a and norm_b else 0.0
    return {"similarity_score": round(similarity, 6)}

@router.post("/data/text-chunker")
async def text_chunker(body: ChunkPayload, x_rapidapi_key: str = Header(None, alias="X-RapidAPI-Key")):
    if not x_rapidapi_key:
        raise HTTPException(status_code=401, detail="Unauthorized. Missing X-RapidAPI-Key.")
    
    text = body.document
    step = body.chunk_size - body.overlap
    chunks = [text[i:i + body.chunk_size] for i in range(0, len(text), max(1, step))]
    
    return {
        "total_chunks": len(chunks),
        "chunk_size": body.chunk_size,
        "overlap": body.overlap,
        "chunks": chunks
    }

@router.post("/data/json-flatten")
async def json_flatten(body: FlattenPayload, x_rapidapi_key: str = Header(None, alias="X-RapidAPI-Key")):
    if not x_rapidapi_key:
        raise HTTPException(status_code=401, detail="Unauthorized. Missing X-RapidAPI-Key.")
    
    def flatten(d, parent_key='', sep='.'):
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(flatten(v, new_key, sep=sep).items())
            else:
                items.append((new_key, v))
        return dict(items)

    flattened = flatten(body.nested_json)
    return {"flattened_json": flattened}

@router.post("/data/deduplicate-array")
async def deduplicate_array(body: DeduplicatePayload, x_rapidapi_key: str = Header(None, alias="X-RapidAPI-Key")):
    if not x_rapidapi_key:
        raise HTTPException(status_code=401, detail="Unauthorized. Missing X-RapidAPI-Key.")
    
    seen = set()
    cleaned = []
    for item in body.items:
        normalized = item.strip().lower()
        if normalized not in seen:
            seen.add(normalized)
            cleaned.append(item)
            
    return {
        "original_count": len(body.items),
        "unique_count": len(cleaned),
        "deduplicated_items": cleaned
    }
