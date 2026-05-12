#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

Adafruit_PWMServoDriver pwm1 = Adafruit_PWMServoDriver(0x40);
Adafruit_PWMServoDriver pwm2 = Adafruit_PWMServoDriver(0x41);

#define SERVOMIN 120
#define SERVOMAX 600
#define TOTAL_CELLS 5
#define DOTS_PER_CELL 6

// Function to get the bitmask for a character
uint8_t getBraillePattern(char c) {
    c = tolower(c);
    switch (c) {
        // Letters
        case 'a': return 0b111110; case 'b': return 0b111100;
        case 'c': return 0b110110; case 'd': return 0b100110;
        case 'e': return 0b101110; case 'f': return 0b110100;
        case 'g': return 0b100100; case 'h': return 0b101100;
        case 'i': return 0b110101; case 'j': return 0b100101;
        case 'k': return 0b111010; case 'l': return 0b111000;
        case 'm': return 0b110010; case 'n': return 0b100010;
        case 'o': return 0b101010; case 'p': return 0b110000;
        case 'q': return 0b100000; case 'r': return 0b101000;
        case 's': return 0b110001; case 't': return 0b100001;
        case 'u': return 0b011010; case 'v': return 0b011000;
        case 'w': return 0b000101; case 'x': return 0b010010;
        case 'y': return 0b000010; case 'z': return 0b001010;

        // Numbers (Standard Braille uses A-J patterns)
        case '1': return 0b111110; // Same as 'a'
        case '2': return 0b111100; // Same as 'b'
        case '3': return 0b110110; // Same as 'c'
        case '4': return 0b100110; // Same as 'd'
        case '5': return 0b101110; // Same as 'e'
        case '6': return 0b110100; // Same as 'f'
        case '7': return 0b100100; // Same as 'g'
        case '8': return 0b101100; // Same as 'h'
        case '9': return 0b110101; // Same as 'i'
        case '0': return 0b100101; // Same as 'j'

        // Special Indicators
        case '#': return 0b111100; // Number Indicator (Dots 3,4,5,6)
        
        // Punctuation
        case '.': return 0b010011;
        case ',': return 0b010000;
        case '?': return 0b011001;
        case '\'': case '"': return 0b000010;
        case ' ': return 0b000000; 
        default:  return 0b000000; 
    }
}

int angleToPulse(int angle) {
    return map(constrain(angle, 0, 180), 0, 180, SERVOMIN, SERVOMAX);
}

void updateCell(int cellIdx, char c) {
    uint8_t pattern = getBraillePattern(c);

    for (int dot = 0; dot < DOTS_PER_CELL; dot++) {
        int servoChannel = (cellIdx * DOTS_PER_CELL) + dot;
        
        // logic: bit 1 means 0 degrees (UP), bit 0 means 30 degrees (DOWN)
        int angle = (pattern & (1 << dot)) ? 0 : 30;
        int pulse = angleToPulse(angle);

        if (servoChannel < 16) {
            pwm1.setPWM(servoChannel, 0, pulse);
        } else {
            pwm2.setPWM(servoChannel - 16, 0, pulse);
        }
    }
}

void setup() {
    Serial.begin(115200);
    Wire.begin(21, 22);
    pwm1.begin(); pwm2.begin();
    pwm1.setPWMFreq(50); pwm2.setPWMFreq(50);
    
    // Initial Reset: All rods DOWN
    for(int i=0; i<30; i++) {
        int p = angleToPulse(30);
        if(i < 16) pwm1.setPWM(i, 0, p);
        else pwm2.setPWM(i-16, 0, p);
    }
    Serial.println("SYSTEM_READY");
}

void loop() {
    // Wait for at least 5 characters
    if (Serial.available() >= 5) {
        String input = Serial.readStringUntil('\n');
        input.trim();
        
        // Process only up to 5 cells
        for (int i = 0; i < TOTAL_CELLS && i < input.length(); i++) {
            updateCell(i, input[i]);
        }
        Serial.println("ACK"); 
    }
}