import { LlmService } from './llm.service';

describe('LlmService', () => {
    let service: LlmService;
    let mockConfigService: any;

    describe('with gemini provider', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            mockConfigService = {
                get: jest.fn((key: string, defaultValue?: any) => {
                    if (key === 'LLM_PROVIDER') return 'gemini';
                    if (key === 'LLM_API_KEY') return 'test-api-key';
                    return defaultValue;
                }),
            };
            service = new LlmService(mockConfigService);
        });

        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('calls the Gemini path and returns generated text', async () => {
            // Spy on the private callGemini method to avoid dynamic import issues in Jest
            const spy = jest.spyOn(service as any, 'callGemini').mockResolvedValue('AI generated text');

            const result = await service.generateText('Test prompt');

            expect(spy).toHaveBeenCalledWith('Test prompt');
            expect(result).toBe('AI generated text');
        });
    });

    describe('with openai provider', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            mockConfigService = {
                get: jest.fn((key: string, defaultValue?: any) => {
                    if (key === 'LLM_PROVIDER') return 'openai';
                    if (key === 'LLM_API_KEY') return 'test-api-key';
                    return defaultValue;
                }),
            };
            service = new LlmService(mockConfigService);
        });

        it('calls the OpenAI path and returns generated text', async () => {
            const spy = jest.spyOn(service as any, 'callOpenAI').mockResolvedValue('OpenAI response');

            const result = await service.generateText('Test prompt');

            expect(spy).toHaveBeenCalledWith('Test prompt');
            expect(result).toBe('OpenAI response');
        });
    });

    describe('with unknown provider', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            mockConfigService = {
                get: jest.fn((key: string, defaultValue?: any) => {
                    if (key === 'LLM_PROVIDER') return 'unsupported';
                    if (key === 'LLM_API_KEY') return 'test-api-key';
                    return defaultValue;
                }),
            };
            service = new LlmService(mockConfigService);
        });

        it('throws an error for an unknown provider', async () => {
            await expect(service.generateText('Test prompt'))
                .rejects.toThrow('Unknown LLM provider: unsupported');
        });
    });

    describe('error handling', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            mockConfigService = {
                get: jest.fn((key: string, defaultValue?: any) => {
                    if (key === 'LLM_PROVIDER') return 'gemini';
                    if (key === 'LLM_API_KEY') return 'test-api-key';
                    return defaultValue;
                }),
            };
            service = new LlmService(mockConfigService);
        });

        it('rethrows errors from the underlying provider', async () => {
            jest.spyOn(service as any, 'callGemini').mockRejectedValue(new Error('API key invalid'));

            await expect(service.generateText('Test prompt'))
                .rejects.toThrow('API key invalid');
        });

        it('logs the error before rethrowing', async () => {
            const loggerSpy = jest.spyOn((service as any).logger, 'error');
            jest.spyOn(service as any, 'callGemini').mockRejectedValue(new Error('Network timeout'));

            await expect(service.generateText('Test prompt')).rejects.toThrow('Network timeout');

            expect(loggerSpy).toHaveBeenCalledWith('LLM generation failed: Network timeout');
        });
    });
});
