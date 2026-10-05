import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class Localization {
    private static instance: Localization;
    private translations: { [key: string]: string } = {};
    
    static getInstance(): Localization {
        if (!Localization.instance) {
            Localization.instance = new Localization();
        }
        return Localization.instance;
    }
    
    async loadTranslations(extensionPath: string, language?: string): Promise<void> {
        if (!language) {
            const config = vscode.workspace.getConfiguration('satori');
            language = config.get<string>('language', 'en'); 
        }
        
        const translationPath = path.join(extensionPath,  'localization', `${language}.json`);
        
        try {
            const content = fs.readFileSync(translationPath, 'utf8');
            this.translations = JSON.parse(content);
        } catch (error) {
            const fallbackPath = path.join(extensionPath, 'localization', 'en.json');
            const content = fs.readFileSync(fallbackPath, 'utf8');
            this.translations = JSON.parse(content);
        }
    }
    
    getByPrefix(...prefixes: string[]): Record<string, string> {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(this.translations)) {
            if (prefixes.some(p => key.startsWith(p))) {
                result[key] = value;
            }
        }
        return result;
    }

    t(key: string, ...args: string[]): string {
        let translation = this.translations[key] || key;
        
        args.forEach((arg, index) => {
            translation = translation.replace(`{${index}}`, arg);
        });
        
        return translation;
    }
}

export const t = (key: string, ...args: string[]) => {
    return Localization.getInstance().t(key, ...args);
};