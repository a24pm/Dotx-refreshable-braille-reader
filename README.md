# DotX: A Servo Motor-Based Refreshable Braille Reader

## Overview
DotX is a smart refreshable braille reader designed to help visually impaired users read digital text through dynamically actuated braille cells using servo motors and ESP32.

The system combines embedded systems, OCR, and web technologies to convert digital or scanned text into tactile braille output.

---

## Features
- Refreshable braille display mechanism
- ESP32-based hardware control
- OCR-based text recognition
- Web interface for interaction
- Braille guide support
- Serial communication support
- Real-time text processing

---

## Technologies Used

### Hardware
- ESP32
- Servo Motors
- Braille Mechanical Setup

### Software
- Python
- C++
- HTML/CSS/JavaScript
- Flask
- OCR Processing

---

## Project Structure

```bash
.
├── static/
│   ├── css/
│   ├── img/
│   └── js/
├── templates/
│   └── index.html
├── app.py
├── groq_chat.py
├── main.cpp
├── ocr_handler.py
├── serial_mock.py
├── requirements.txt
└── README.md
```

---

## Working Principle
1. User inputs text or uploads an image.
2. OCR extracts the text from the image.
3. Text is processed into braille-compatible data.
4. ESP32 controls servo motors to generate refreshable braille output.
5. Users can physically read the generated braille pattern.

---

## Installation

### Clone the Repository

```bash
git clone https://github.com/yourusername/DotX-Braille-Reader.git
cd DotX-Braille-Reader
```

### Install Python Dependencies

```bash
pip install -r requirements.txt
```

### Run the Application

```bash
python app.py
```

---

## Applications
- Assistive technology for visually impaired individuals
- Smart educational tools
- Digital braille reading systems
- Embedded accessibility solutions

---

## Future Improvements
- Wireless mobile integration
- Voice assistant support
- Multi-line braille display
- Compact portable design
- AI-powered text summarization

---

## Team Members
- Amal Madhu
- [Add other team members]

---

## License
This project is developed for educational and research purposes.
