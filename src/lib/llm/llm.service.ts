import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LlmService {
    private readonly logger = new Logger(LlmService.name);
    private readonly provider: string;

    constructor(private readonly configService: ConfigService) {
        this.provider = this.configService.get<string>('LLM_PROVIDER', 'gemini');
    }

    async generateText(prompt: string): Promise<string> {
        try {
            if (this.provider === 'gemini') {
                return await this.callGemini(prompt);
            }
            if (this.provider === 'openai') {
                return await this.callOpenAI(prompt);
            }
            throw new Error(`Unknown LLM provider: ${this.provider}`);
        } catch (error) {
            this.logger.error(`LLM generation failed: ${error.message}`);
            throw error;
        }
    }

    private async callGemini(prompt: string): Promise<string> {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: this.configService.get<string>('LLM_API_KEY') });
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: prompt,
        });
        return response.text ?? '';
    }

    private async callOpenAI(prompt: string): Promise<string> {
        const OpenAI = (await import('openai')).default;
        const client = new OpenAI({ apiKey: this.configService.get<string>('LLM_API_KEY') });
        const response = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
        });
        return response.choices[0]?.message?.content ?? '';
    }
}
