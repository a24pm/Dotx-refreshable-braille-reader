"""
Groq AI Chatbot - Handles voice-based Q&A for blind users.
Uses Groq's fast inference API with Llama model.
"""

import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

# Initialize Groq client
_client = None


def _get_client():
    """Lazy-initialize the Groq client."""
    global _client
    if _client is None:
        api_key = os.environ.get('GROQ_API_KEY')
        if not api_key:
            raise ValueError(
                "GROQ_API_KEY environment variable is not set. "
                "Get your free API key at https://console.groq.com"
            )
        _client = Groq(api_key=api_key)
    return _client


def get_response(question, conversation_history=None):
    """
    Get an AI response to a user's question.
    
    Args:
        question: The user's question text
        conversation_history: Optional list of previous messages
        
    Returns:
        The AI's response text
    """
    client = _get_client()

    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful AI assistant designed for blind users. "
                "Keep your answers clear, concise, and well-structured. "
                "Avoid using visual references. When describing things, "
                "use descriptive language that works well when read aloud. "
                "Keep responses under 200 words unless the user asks for detail."
            )
        }
    ]

    # Add conversation history if provided
    if conversation_history:
        for msg in conversation_history[-10:]:  # Keep last 10 messages
            messages.append(msg)

    messages.append({
        "role": "user",
        "content": question
    })

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.7,
            max_tokens=512,
            top_p=0.9,
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"I'm sorry, I encountered an error: {str(e)}"
