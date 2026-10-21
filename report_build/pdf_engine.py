import os
import sys
import zlib
import re

def escape_pdf(text):
    """Escapes text for PDF literal strings."""
    if text is None:
        return ""
    text = str(text)
    # Replace special characters for PDF latin-1 strings
    text = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    # Map unicode characters that latin-1 can't encode to clean ascii
    text = text.replace("—", "--").replace("–", "-").replace("“", "\"").replace("”", "\"")
    text = text.replace("‘", "'").replace("’", "'").replace("•", "*").replace("→", "->")
    text = text.replace("≤", "<=").replace("≥", ">=").replace("±", "+/-")
    # Encode into latin-1 safely
    return text.encode("latin-1", "replace").decode("latin-1")

class PDFPage:
    def __init__(self, page_num, total_pages, title="Project Report: Full-Stack Observability"):
        self.page_num = page_num
        self.total_pages = total_pages
        self.title = title
        self.stream = []
        self.y = 790
        self.left_margin = 48
        self.right_margin = 547
        self.bottom_margin = 48
        
        # Add running header on all pages except cover page (page 1)
        if page_num > 1:
            self._draw_header()
        self._draw_footer()

    def _draw_header(self):
        # Top banner line
        self.stream.append("0.2 0.3 0.5 RG 0.75 w")
        self.stream.append(f"{self.left_margin} 805 m {self.right_margin} 805 l S")
        # Header text
        self.stream.append("0.35 0.4 0.55 rg")
        self.stream.append("BT /F5 8 Tf")
        self.stream.append(f"{self.left_margin} 810 Td ({escape_pdf(self.title)}) Tj ET")
        self.stream.append("BT /F5 8 Tf")
        self.stream.append(f"400 810 Td ({escape_pdf('LGTM & OpenTelemetry Implementation')}) Tj ET")
        self.y = 780

    def _draw_footer(self):
        # Bottom rule
        self.stream.append("0.7 0.75 0.8 RG 0.5 w")
        self.stream.append(f"{self.left_margin} 40 m {self.right_margin} 40 l S")
        # Footer text
        self.stream.append("0.4 0.45 0.5 rg")
        self.stream.append("BT /F1 8 Tf")
        self.stream.append(f"{self.left_margin} 28 Td ({escape_pdf('Confidential & Proprietary - Engineering Report')}) Tj ET")
        page_str = f"Page {self.page_num} of {self.total_pages}"
        self.stream.append(f"BT /F2 8 Tf 490 28 Td ({escape_pdf(page_str)}) Tj ET")

    def add_chapter_title(self, text):
        self.stream.append("0.08 0.22 0.45 rg")  # Deep blue
        self.stream.append("BT /F2 16 Tf")
        self.stream.append(f"{self.left_margin} {self.y} Td ({escape_pdf(text)}) Tj ET")
        self.y -= 4
        # Accent rule under chapter
        self.stream.append("0.15 0.45 0.75 RG 1.5 w")
        self.stream.append(f"{self.left_margin} {self.y} m {self.right_margin} {self.y} l S")
        self.y -= 18

    def add_section_heading(self, text):
        self.y -= 6
        self.stream.append("0.12 0.28 0.52 rg")  # Steel blue
        self.stream.append("BT /F2 12 Tf")
        self.stream.append(f"{self.left_margin} {self.y} Td ({escape_pdf(text)}) Tj ET")
        self.y -= 14

    def add_sub_heading(self, text):
        self.y -= 4
        self.stream.append("0.18 0.35 0.55 rg")
        self.stream.append("BT /F2 10 Tf")
        self.stream.append(f"{self.left_margin} {self.y} Td ({escape_pdf(text)}) Tj ET")
        self.y -= 12

    def add_paragraph(self, text, indent=0):
        # Word wrap at approx 92 characters
        words = text.split(" ")
        lines = []
        current_line = []
        current_len = 0
        max_chars = 90 - int(indent / 5)

        for w in words:
            if current_len + len(w) + 1 <= max_chars:
                current_line.append(w)
                current_len += len(w) + 1
            else:
                lines.append(" ".join(current_line))
                current_line = [w]
                current_len = len(w)
        if current_line:
            lines.append(" ".join(current_line))

        self.stream.append("0.15 0.15 0.2 rg")  # Dark charcoal text
        for line in lines:
            self.stream.append("BT /F1 9.5 Tf")
            self.stream.append(f"{self.left_margin + indent} {self.y} Td ({escape_pdf(line)}) Tj ET")
            self.y -= 12.5
        self.y -= 4

    def add_bullet(self, title, description):
        self.stream.append("0.15 0.45 0.75 rg")
        self.stream.append("BT /F2 9.5 Tf")
        bullet_str = f"* {title}: "
        self.stream.append(f"{self.left_margin + 8} {self.y} Td ({escape_pdf(bullet_str)}) Tj ET")
        
        # Calculate remaining line wrapping
        offset = len(bullet_str) * 5.2
        self.stream.append("0.2 0.2 0.25 rg")
        self.stream.append("BT /F1 9.5 Tf")
        
        words = description.split(" ")
        lines = []
        current_line = []
        current_len = 0
        max_first_line = int((self.right_margin - (self.left_margin + 8 + offset)) / 5.2)
        
        idx = 0
        while idx < len(words):
            w = words[idx]
            if current_len + len(w) + 1 <= max_first_line:
                current_line.append(w)
                current_len += len(w) + 1
                idx += 1
            else:
                break
        first_line_txt = " ".join(current_line)
        self.stream.append(f"{self.left_margin + 8 + offset} {self.y} Td ({escape_pdf(first_line_txt)}) Tj ET")
        self.y -= 12

        # Remainder lines
        rem_words = words[idx:]
        if rem_words:
            current_line = []
            current_len = 0
            for w in rem_words:
                if current_len + len(w) + 1 <= 82:
                    current_line.append(w)
                    current_len += len(w) + 1
                else:
                    lines.append(" ".join(current_line))
                    current_line = [w]
                    current_len = len(w)
            if current_line:
                lines.append(" ".join(current_line))
            for l in lines:
                self.stream.append(f"BT /F1 9.5 Tf {self.left_margin + 20} {self.y} Td ({escape_pdf(l)}) Tj ET")
                self.y -= 12
        self.y -= 2

    def add_table(self, headers, rows, col_widths):
        # Table top border & header background
        total_w = sum(col_widths)
        self.stream.append("0.9 0.93 0.97 rg")
        self.stream.append(f"{self.left_margin} {self.y - 14} {total_w} 16 re f")
        self.stream.append("0.2 0.3 0.5 RG 1 w")
        self.stream.append(f"{self.left_margin} {self.y - 14} {total_w} 16 re S")
        
        # Headers
        self.stream.append("0.08 0.2 0.4 rg")
        cur_x = self.left_margin
        for idx, h in enumerate(headers):
            self.stream.append("BT /F2 8.5 Tf")
            self.stream.append(f"{cur_x + 4} {self.y - 10} Td ({escape_pdf(h)}) Tj ET")
            cur_x += col_widths[idx]
            if idx < len(headers) - 1:
                self.stream.append(f"{cur_x} {self.y - 14} m {cur_x} {self.y + 2} l S")
        self.y -= 15

        # Rows
        for r_idx, row in enumerate(rows):
            bg_color = "0.98 0.98 0.99 rg" if r_idx % 2 == 1 else "1 1 1 rg"
            self.stream.append(bg_color)
            self.stream.append(f"{self.left_margin} {self.y - 12} {total_w} 13 re f")
            self.stream.append("0.8 0.85 0.9 RG 0.5 w")
            self.stream.append(f"{self.left_margin} {self.y - 12} {total_w} 13 re S")
            
            cur_x = self.left_margin
            for c_idx, val in enumerate(row):
                self.stream.append("0.15 0.15 0.2 rg")
                self.stream.append("BT /F3 8 Tf")
                self.stream.append(f"{cur_x + 4} {self.y - 9} Td ({escape_pdf(str(val))}) Tj ET")
                cur_x += col_widths[c_idx]
                if c_idx < len(row) - 1:
                    self.stream.append(f"{cur_x} {self.y - 12} m {cur_x} {self.y + 1} l S")
            self.y -= 13
        self.y -= 8

    def add_code_block(self, lines):
        # Draw background rectangle
        box_height = len(lines) * 10.5 + 8
        self.stream.append("0.94 0.95 0.97 rg")
        self.stream.append(f"{self.left_margin} {self.y - box_height + 4} {self.right_margin - self.left_margin} {box_height} re f")
        self.stream.append("0.65 0.72 0.82 RG 0.75 w")
        self.stream.append(f"{self.left_margin} {self.y - box_height + 4} {self.right_margin - self.left_margin} {box_height} re S")
        
        self.y -= 8
        self.stream.append("0.1 0.15 0.25 rg")
        for line in lines:
            self.stream.append("BT /F3 7.8 Tf")
            self.stream.append(f"{self.left_margin + 8} {self.y} Td ({escape_pdf(line)}) Tj ET")
            self.y -= 10.5
        self.y -= 6

    def add_callout(self, title, text):
        box_h = 36
        self.stream.append("0.93 0.96 0.99 rg")
        self.stream.append(f"{self.left_margin} {self.y - box_h} {self.right_margin - self.left_margin} {box_h} re f")
        self.stream.append("0.15 0.45 0.8 RG 2 w")
        self.stream.append(f"{self.left_margin} {self.y - box_h} m {self.left_margin} {self.y} l S")
        self.stream.append("0.7 0.8 0.9 RG 0.5 w")
        self.stream.append(f"{self.left_margin} {self.y - box_h} m {self.right_margin} {self.y - box_h} l {self.right_margin} {self.y} l {self.left_margin} {self.y} l S")
        
        self.stream.append("0.1 0.3 0.6 rg BT /F2 9 Tf")
        self.stream.append(f"{self.left_margin + 10} {self.y - 12} Td ({escape_pdf(title)}) Tj ET")
        self.stream.append("0.2 0.25 0.35 rg BT /F1 8.5 Tf")
        self.stream.append(f"{self.left_margin + 10} {self.y - 25} Td ({escape_pdf(text)}) Tj ET")
        self.y -= (box_h + 8)

    def get_content(self):
        return "\n".join(self.stream)

def build_pdf_binary(pages_data, output_filepath):
    num_pages = len(pages_data)
    catalog_obj = "<< /Type /Catalog /Pages 2 0 R >>"
    
    # 5 standard font declarations
    f1 = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    f2 = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
    f3 = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"
    f4 = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>"
    f5 = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>"
    
    kids = ["%d 0 R" % (8 + i * 2) for i in range(num_pages)]
    pages_obj = "<< /Type /Pages /Kids [" + " ".join(kids) + "] /Count " + str(num_pages) + " >>"
    
    all_objs = [
        catalog_obj.encode("latin-1"),
        pages_obj.encode("latin-1"),
        f1.encode("latin-1"),
        f2.encode("latin-1"),
        f3.encode("latin-1"),
        f4.encode("latin-1"),
        f5.encode("latin-1")
    ]
    
    for i, content_stream in enumerate(pages_data):
        stream_id = 9 + i * 2
        comp_stream = zlib.compress(content_stream.encode("latin-1"))
        page_dict = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R /F5 7 0 R >> >> /Contents " + str(stream_id) + " 0 R >>"
        stream_dict = ("<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(comp_stream)).encode("latin-1") + comp_stream + b"\nendstream"
        all_objs.append(page_dict.encode("latin-1"))
        all_objs.append(stream_dict)
        
    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    xref_offsets = []
    
    for idx, obj_bytes in enumerate(all_objs, 1):
        xref_offsets.append(len(pdf))
        pdf.extend(("%d 0 obj\n" % idx).encode("latin-1"))
        pdf.extend(obj_bytes)
        pdf.extend(b"\nendobj\n")
        
    xref_start = len(pdf)
    pdf.extend(("xref\n0 %d\n" % (len(all_objs) + 1)).encode("latin-1"))
    pdf.extend(b"0000000000 65535 f \n")
    for off in xref_offsets:
        pdf.extend(("%010d 00000 n \n" % off).encode("latin-1"))
        
    pdf.extend(("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(all_objs) + 1, xref_start)).encode("latin-1"))
    
    with open(output_filepath, "wb") as f:
        f.write(pdf)
    print("Successfully built PDF at %s (%d bytes, %d pages)" % (output_filepath, len(pdf), num_pages))
