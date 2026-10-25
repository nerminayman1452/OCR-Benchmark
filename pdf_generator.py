import os
import io
import cv2
import numpy as np
from PIL import Image
import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.pdfgen.canvas import Canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import re

def get_pts(item):
    if 'coordinates' in item:
        coords = item['coordinates']
        ul = coords.get('upper_left', {})
        br = coords.get('bottom_right', {})
        if 'x' in ul and 'y' in ul and 'x' in br and 'y' in br:
            return np.array([
                [ul['x'], ul['y']],
                [br['x'], ul['y']],
                [br['x'], br['y']],
                [ul['x'], br['y']]
            ], np.int32)
    elif 'line_coordinates' in item:
        coords = item['line_coordinates']
        tl = coords.get('top_left', [])
        tr = coords.get('top_right', [])
        br = coords.get('bottom_right', [])
        bl = coords.get('bottom_left', [])
        if tl and tr and br and bl:
            return np.array([
                [tl[0], tl[1]],
                [tr[0], tr[1]],
                [br[0], br[1]],
                [bl[0], bl[1]]
            ], np.int32)
    return None

def create_pdf_overlay(image_bytes, lines_data, font_path="Amiri-Regular.ttf"):
    # image_bytes is the raw image bytes
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(img_rgb)
    width, height = pil_img.size

    # Fallback to system arial if font not found
    if not os.path.exists(font_path):
        font_path = "C:\\Windows\\Fonts\\arial.ttf"
    from reportlab.lib.utils import ImageReader
    pdfmetrics.registerFont(TTFont("Amiri", font_path))

    pdf_io = io.BytesIO()
    pdf = Canvas(pdf_io, pagesize=(width, height), pageCompression=1)

    # Draw the image as the background
    img_reader = ImageReader(io.BytesIO(image_bytes))
    pdf.drawImage(img_reader, 0, 0, width=width, height=height)

    reshaper = arabic_reshaper.ArabicReshaper(
        configuration={
            "support_ligatures": False,
        }
    )

    for line in lines_data:
        text = line.get('text', '')
        if not text:
            continue
        
        pts = get_pts(line)
        if pts is None:
            continue
            
        x_min = np.min(pts[:, 0])
        x_max = np.max(pts[:, 0])
        y_min = np.min(pts[:, 1])
        y_max = np.max(pts[:, 1])
        
        box_height = y_max - y_min
        font_size = box_height * 0.8
        
        pdf.setFont("Amiri", font_size)
        pdf.setFillColorRGB(0, 0, 0, alpha=0.0) # Transparent text
        
        reshaped_text = reshaper.reshape(text)
        bidi_text = get_display(reshaped_text)
        
        text_width = pdf.stringWidth(bidi_text, "Amiri", font_size)
        
        # Calculate Y so it's centered in the box
        # PDF coordinates are from bottom-left
        pdf_y = height - y_max + (box_height - font_size)/2.0 + (font_size * 0.2)
        pdf_x = x_max - text_width
        
        pdf.drawString(pdf_x, pdf_y, bidi_text)
        
    pdf.save()
    return pdf_io.getvalue()

def get_updated_full_pdf_bytes(pdfs_dir, single_pdf_name, new_page_bytes):
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        return None, "pypdf library not installed"
        
    match = re.search(r'(_page_)(\d+)\.pdf$', single_pdf_name)
    if not match:
        return None, "Could not extract page number from filename"
        
    page_num = int(match.group(2))
    full_pdf_name = single_pdf_name[:match.start()] + ".pdf"
    full_pdf_path = os.path.join(pdfs_dir, full_pdf_name)
    
    if not os.path.exists(full_pdf_path):
        return None, f"Full PDF {full_pdf_name} not found in {pdfs_dir}"
        
    try:
        reader = PdfReader(full_pdf_path)
        writer = PdfWriter()
        
        new_page_reader = PdfReader(io.BytesIO(new_page_bytes))
        new_page = new_page_reader.pages[0]
        
        target_index = page_num - 1
        
        for i in range(len(reader.pages)):
            if i == target_index:
                writer.add_page(new_page)
            else:
                writer.add_page(reader.pages[i])
                
        out_io = io.BytesIO()
        writer.write(out_io)
        return out_io.getvalue(), full_pdf_name
    except Exception as e:
        return None, f"Error: {str(e)}"
