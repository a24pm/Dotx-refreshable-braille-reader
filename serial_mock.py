"""
Serial Port Wrapper for Braille Hardware.
Attempts to connect to physical hardware on the specified port. 
If unavailable, gracefully falls back to mock mode.
"""

import time
import threading
import serial
import serial.tools.list_ports

class MockSerial:
    """
    Hardware Serial wrapper with built-in Mock fallback.
    """
    def __init__(self, port='AUTO', baudrate=115200):
        if port == 'AUTO':
            ports = list(serial.tools.list_ports.comports())
            self.port = ports[0].device if ports else 'COM3'
        else:
            self.port = port
            
        self.baudrate = baudrate
        self.is_open = False
        self.conn = None
        self.is_mock = True

    def open(self):
        self.is_open = True
        try:
            self.conn = serial.Serial(self.port, self.baudrate, timeout=0.1)
            self.is_mock = False
            print(f"[Serial] Opened HARDWARE at {self.port} ({self.baudrate} baud)")
            time.sleep(2)  # Wait for Arduino boot
            
            # Clear boot messages (like SYSTEM_READY)
            while self.conn.in_waiting:
                self.conn.read(self.conn.in_waiting)
                
        except serial.SerialException as e:
            self.is_mock = True
            print(f"[Serial] Hardware not found on {self.port}. Running in MOCK mode. ({e})")

    def close(self):
        self.is_open = False
        if self.conn:
            self.conn.close()
            self.conn = None
        print(f"[Serial] Closed {self.port}")

    def write(self, data):
        if isinstance(data, str):
            data = data.encode('utf-8')
            
        decoded = data.decode('utf-8', errors='replace').strip()
        spaced = ' '.join(list(decoded))
        
        mode = "MOCK TX" if self.is_mock else "HW TX"
        print(f"[{mode}] -> '{spaced}'")
        
        if self.conn and not self.is_mock:
            self.conn.write(data)
        return len(data)

    def read(self, size=1):
        if self.conn and not self.is_mock:
            return self.conn.read(size)
        return b''

    def readline(self):
        if self.conn and not self.is_mock:
            return self.conn.readline()
        return b''


class BrailleController:
    """
    Controls the Braille display by sending text in 5-character chunks.
    Syncs with hardware ACKs before enforcing the spacing cooldown.
    """

    def __init__(self, serial_port=None):
        self.serial = serial_port or MockSerial()
        self.is_running = False
        self._thread = None
        self._stop_event = threading.Event()
        self.chunk_size = 5
        self.delay = 5.0  # cooldown for audio spelling and user reading

    def start(self, text, on_chunk=None, on_complete=None):
        if self.is_running:
            self.stop()

        self._stop_event.clear()
        self.is_running = True

        if not self.serial.is_open:
            self.serial.open()

        self._thread = threading.Thread(
            target=self._send_loop,
            args=(text, on_chunk, on_complete),
            daemon=True
        )
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        self.is_running = False
        if self._thread:
            self._thread.join(timeout=3)
        print("[BrailleController] Stopped")

    def _send_loop(self, text, on_chunk, on_complete):
        # Clean text - keep only printable chars
        clean_text = ''.join(c for c in text if c.isprintable())

        # Custom Braille format requested by user: Insert '#' indicator before EVERY single digit
        import re
        clean_text = re.sub(r'#?(\d)', r'#\1', clean_text)

        if not clean_text:
            self.is_running = False
            return

        # Split into chunks of 5
        chunks = []
        for i in range(0, len(clean_text), self.chunk_size):
            chunk = clean_text[i:i + self.chunk_size]
            chunk = chunk.ljust(self.chunk_size)
            chunks.append(chunk)

        total = len(chunks)
        print(f"[BrailleController] Sending {total} chunks of {self.chunk_size} chars")

        for idx, chunk in enumerate(chunks):
            if self._stop_event.is_set():
                break

            # Write to serial (with newline for hardware readStringUntil('\n'))
            self.serial.write(chunk + '\n')

            # Wait for ACK if using hardware
            if getattr(self.serial, 'conn', None) and not self.serial.is_mock:
                start_wait = time.time()
                while time.time() - start_wait < 2.0:
                    line = self.serial.readline().decode('utf-8', errors='ignore').strip()
                    if line == "ACK":
                        print("[BrailleController] Received HW ACK")
                        break
                    time.sleep(0.01)

            # Notify callback (triggers UI updates and TTS spelling)
            if on_chunk:
                try:
                    on_chunk(chunk, idx, total)
                except Exception as e:
                    print(f"[BrailleController] Callback error: {e}")

            # Wait before next chunk for cooldown
            if idx < total - 1:
                if self._stop_event.wait(timeout=self.delay):
                    break

        self.is_running = False

        if on_complete and not self._stop_event.is_set():
            try:
                on_complete()
            except Exception as e:
                print(f"[BrailleController] Complete callback error: {e}")

        print("[BrailleController] Cycle complete")
