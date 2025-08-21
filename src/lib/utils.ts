import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


// Helper to parse skill levels safely
export const parseSkillLevels = (skillLevelsData: any): Record<string, number> => {
  if (typeof skillLevelsData === 'string') {
    try {
      const parsed = JSON.parse(skillLevelsData);
      if (typeof parsed === 'object' && parsed !== null) {
        // Ensure values are numbers
         const cleaned: Record<string, number> = {};
         for (const key in parsed) {
           if (Object.prototype.hasOwnProperty.call(parsed, key)) {
             const value = Number(parsed[key]);
             if (!isNaN(value)) {
               cleaned[key] = value;
             }
           }
         }
         return cleaned;
      }
      // console.warn("[parseSkillLevels] Parsed skill_levels string was not an object:", parsed);
      return {};
    } catch (e) {
      console.error("[parseSkillLevels] Error parsing skill_levels JSON string:", e);
      return {};
    }
  } else if (typeof skillLevelsData === 'object' && skillLevelsData !== null) {
     // Ensure values are numbers
     const cleaned: Record<string, number> = {};
     for (const key in skillLevelsData) {
       if (Object.prototype.hasOwnProperty.call(skillLevelsData, key)) {
         const value = Number(skillLevelsData[key]);
         if (!isNaN(value)) {
           cleaned[key] = value;
         } else {
            // console.warn(`[parseSkillLevels] Invalid number value for skill level '${key}':`, skillLevelsData[key]);
         }
       }
     }
     return cleaned;
  }
   // console.warn("[parseSkillLevels] skill_levels data was not a string or object:", skillLevelsData);
  return {};
};
