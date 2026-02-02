function sanitizeStringForJSON(str: string | undefined | null): string | undefined | null {
    if (typeof str !== 'string') {
        return str; 
    }
    

      let sanitized = str.replace(/[\x00-\x07\x0b\x0e-\x1f\x7f]/g, function (char) {
          return '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4);
      });

      sanitized = sanitized
          .replace(/\r\n/g, '\\n') 
          .replace(/\n/g, '\\n')   // ASCII 10 (LF) 
          .replace(/\r/g, '\\r')   // ASCII 13 (CR)
          .replace(/\t/g, '\\t')   // ASCII 9  (TAB)
          .replace(/\f/g, '\\f')   // ASCII 12 (FF)
          .replace(/\x08/g, '\\b');  // ASCII 8 (BS) - Backspace 
      return sanitized;
}

export function sanitizeObjectStrings(obj: any) {
    if (obj === null || typeof obj !== 'object') {
        return;
    }

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            const val = obj[i];
            if (typeof val === 'string') {
                obj[i] = sanitizeStringForJSON(val);
            } else if (typeof val === 'object') {
                sanitizeObjectStrings(val);
            }
        }
    } else {
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                if (typeof value === 'string') {
                    obj[key] = sanitizeStringForJSON(value);
                } else if (typeof value === 'object') {
                    sanitizeObjectStrings(value);
                }
            }
        }
    }
}

