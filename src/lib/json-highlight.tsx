import { ReactNode } from 'react'

/**
 * Check if a string is valid JSON
 */
export function isJson(str: string): boolean {
  try {
    JSON.parse(str)
    return true
  } catch {
    return false
  }
}

/**
 * Format JSON string with indentation
 */
export function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}

/**
 * Lightweight JSON syntax highlighter
 * Returns React nodes with appropriate color classes
 */
export function highlightJson(json: string): ReactNode[] {
  const result: ReactNode[] = []
  let i = 0
  let key = 0
  
  // Regex patterns for JSON tokens
  const patterns = [
    { type: 'string', regex: /"(?:[^"\\]|\\.)*"/ },
    { type: 'number', regex: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/ },
    { type: 'boolean', regex: /\b(?:true|false)\b/ },
    { type: 'null', regex: /\bnull\b/ },
    { type: 'punctuation', regex: /[{}[\]:,]/ },
  ]
  
  while (i < json.length) {
    // Skip whitespace
    const wsMatch = json.slice(i).match(/^\s+/)
    if (wsMatch) {
      result.push(wsMatch[0])
      i += wsMatch[0].length
      continue
    }
    
    let matched = false
    for (const { type, regex } of patterns) {
      const match = json.slice(i).match(new RegExp(`^${regex.source}`))
      if (match) {
        const value = match[0]
        
        // Check if string is a key (followed by colon)
        const isKey = type === 'string' && json.slice(i + value.length).match(/^\s*:/)
        
        const className = isKey 
          ? 'text-violet-400' 
          : type === 'string' 
            ? 'text-emerald-400' 
            : type === 'number' 
              ? 'text-amber-400' 
              : type === 'boolean' || type === 'null'
                ? 'text-rose-400'
                : 'text-muted-foreground'
        
        result.push(
          <span key={key++} className={className}>{value}</span>
        )
        i += value.length
        matched = true
        break
      }
    }
    
    if (!matched) {
      result.push(json[i])
      i++
    }
  }
  
  return result
}

