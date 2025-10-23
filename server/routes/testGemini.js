import express from 'express';
import { GoogleGenAI } from '@google/genai';

const router = express.Router();

router.get('/', async (req, res) => {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Why is the sky blue?',
    });
    console.log(response.text);

});

export default router;