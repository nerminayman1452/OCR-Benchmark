from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import json
import base64
import os
import copy
from pdf_generator import create_pdf_overlay, get_updated_full_pdf_bytes

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def extract_lines(data):
    lines_data = []
    
    if 'files_info' in data:
        for file_info in data['files_info']:
            if 'lines' in file_info:
                for line in file_info['lines']:
                    coords = line.get('coordinates') or line.get('line_coordinates')
                    if coords:
                        lines_data.append({
                            'text': line.get('line_text', ''),
                            'coordinates': coords,
                            'ref_dict': line,
                            'format': 'newspaper'
                        })
                                
    elif 'pages' in data:
        for page in data['pages']:
            if 'zones' in page:
                for zone in page['zones']:
                    if 'paragraphs' in zone:
                        for paragraph in zone['paragraphs']:
                            if 'lines' in paragraph:
                                for line in paragraph['lines']:
                                    coords = line.get('coordinates')
                                    if coords:
                                        lines_data.append({
                                            'text': line.get('text', ''),
                                            'coordinates': coords,
                                            'ref_dict': line,
                                            'format': 'hierarchical'
                                        })
    return lines_data

@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
    return templates.TemplateResponse(request, "index.html")

@app.post("/upload")
async def upload_files(image: UploadFile = File(...), json_file: UploadFile = File(...)):
    try:
        json_content = await json_file.read()
        json_data = json.loads(json_content.decode('utf-8'))
        
        lines_data = extract_lines(json_data)
        
        # Prepare safe lines structure for frontend
        frontend_lines = []
        for idx, line in enumerate(lines_data):
            ref = line.get("ref_dict", {})
            words_arr = ref.get("line_words", ref.get("words", []))
            if words_arr is None:
                words_arr = []
            
            frontend_lines.append({
                "id": idx,
                "text": line.get("text", ""),
                "coordinates": line.get("coordinates", None),
                "line_coordinates": line.get("line_coordinates", None),
                "confidence": ref.get("confidence", ref.get("conf", None)),
                "words": [{"text": w.get("text", ""), "coordinates": w.get("coordinates", w.get("line_coordinates", None))} for w in words_arr]
            })
            
        import os
        return JSONResponse({
            "filename": os.path.basename(json_file.filename),
            "original_json": json_data,
            "lines": frontend_lines
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

def apply_update_to_ref(item, new_text):
    line = item['ref_dict']
    new_words_text = new_text.split()
    
    if item['format'] == 'newspaper':
        line['line_text'] = new_text
        if 'line_words' in line:
            old_words = line.get('line_words', [])
            new_words = []
            for i, w_text in enumerate(new_words_text):
                w_obj = copy.deepcopy(old_words[i]) if i < len(old_words) else (copy.deepcopy(old_words[-1]) if old_words else {})
                w_obj['text'] = w_text
                new_words.append(w_obj)
            line['line_words'] = new_words
            
    elif item['format'] == 'hierarchical':
        line['text'] = new_text
        if 'words' in line:
            old_words = line.get('words', [])
            new_words = []
            for i, w_text in enumerate(new_words_text):
                w_obj = copy.deepcopy(old_words[i]) if i < len(old_words) else (copy.deepcopy(old_words[-1]) if old_words else {})
                w_obj['text'] = w_text
                new_words.append(w_obj)
            line['words'] = new_words

def rebuild_full_text(data):
    if 'files_info' in data:
        for file_info in data['files_info']:
            if 'lines' in file_info:
                full_text = "\n".join([l.get('line_text', '') for l in file_info['lines']])
                file_info['asr_ocr_text'] = full_text
                
    elif 'pages' in data:
        for page in data['pages']:
            page_text = []
            if 'zones' in page:
                for zone in page['zones']:
                    if 'paragraphs' in zone:
                        for paragraph in zone['paragraphs']:
                            if 'lines' in paragraph:
                                page_text.append("\n".join([l.get('text', '') for l in paragraph['lines']]))
            page['text'] = "\n\n".join(page_text)
            
    return data

@app.post("/save")
async def save_files(
    filename: str = Form(...),
    original_json: str = Form(...),
    lines_json: str = Form(...),
    save_dir: str = Form(...),
    image_b64: str = Form(None),
    image: UploadFile = File(None)
):
    try:
        orig_data = json.loads(original_json)
        updated_lines = json.loads(lines_json)
        
        if image:
            img_bytes = await image.read()
        elif image_b64:
            img_bytes = base64.b64decode(image_b64)
        else:
            raise ValueError("No image data provided")
        
        # Apply updates to original JSON lines
        lines_ref = extract_lines(orig_data)
        for i, ref in enumerate(lines_ref):
            if i < len(updated_lines):
                apply_update_to_ref(ref, updated_lines[i]['text'])
                
        # Rebuild parent text blocks based on updated lines
        orig_data = rebuild_full_text(orig_data)
                
        json_bytes = json.dumps(orig_data, indent=4, ensure_ascii=False).encode("utf-8")
        
        # Smart routing
        content_dir = os.path.join(save_dir, "Content")
        pdfs_dir = os.path.join(save_dir, "Protected", "Pdfs")
        
        if os.path.isdir(content_dir):
            json_path = os.path.join(content_dir, filename)
        else:
            json_path = os.path.join(save_dir, filename)
            
        with open(json_path, 'wb') as f:
            f.write(json_bytes)
            
        # PDF Overlay
        # We need to format lines for the PDF generator
        pdf_lines = [{"text": line["text"], "coordinates": line.get("coordinates"), "line_coordinates": line.get("line_coordinates")} for line in updated_lines]
        
        pdf_bytes = create_pdf_overlay(img_bytes, pdf_lines)
        single_pdf_name = filename.replace(".json", ".pdf")
        
        full_pdf_msg = ""
        if os.path.isdir(pdfs_dir):
            pdf_path = os.path.join(pdfs_dir, single_pdf_name)
            success_tuple = get_updated_full_pdf_bytes(pdfs_dir, single_pdf_name, pdf_bytes)
            if success_tuple and success_tuple[0]:
                full_bytes, full_name = success_tuple
                with open(os.path.join(pdfs_dir, full_name), 'wb') as f:
                    f.write(full_bytes)
                full_pdf_msg = f"Updated full PDF: {full_name}"
        else:
            pdf_path = os.path.join(save_dir, single_pdf_name)
            
        with open(pdf_path, 'wb') as f:
            f.write(pdf_bytes)
            
        return JSONResponse({"status": "success", "message": f"Saved successfully! {full_pdf_msg}"})
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
