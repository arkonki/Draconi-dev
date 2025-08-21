import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSkills, GameSkill } from '../../../hooks/useSkills';
import { Ability, SkillRequirement, isSkillNameRequirement, isSkillUuidRequirement } from '../../../types/character';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { ErrorMessage } from '../../shared/ErrorMessage';

interface AbilityFormProps {
  entry: Partial<Ability>;
  onChange: (field: string, value: any) => void;
}

export const AbilityForm: React.FC<AbilityFormProps> = ({ entry, onChange }) => {
  const { skills: allSkills, loading: skillsLoading, error: skillsError } = useSkills();
  const [isSkillsExpanded, setIsSkillsExpanded] = useState(false);
  const [isLoadingRequirements, setIsLoadingRequirements] = useState(false); // Loading state for requirement conversion

  // --- State to manage selected skills and their levels (using NAME as key) ---
  const [selectedSkillsByName, setSelectedSkillsByName] = useState<SkillRequirement>({});
  // ---

  // --- Initialization Logic: Convert incoming requirement to name-based format ---
  const initializeRequirements = useCallback(() => {
    if (skillsLoading || !allSkills || allSkills.length === 0) {
      // Cannot initialize yet if skills aren't loaded
      return;
    }

    setIsLoadingRequirements(true);
    const initialReq = entry.requirement;
    let nameBasedReqs: SkillRequirement = {};

    if (isSkillNameRequirement(initialReq)) {
      // Already in the correct format
      nameBasedReqs = initialReq;
      console.log("AbilityForm: Initial requirement is already name-based:", initialReq);
    } else if (isSkillUuidRequirement(initialReq)) {
      // Needs conversion from UUID to Name
      console.log("AbilityForm: Initial requirement is UUID-based, converting:", initialReq);
      const skillMapById = new Map(allSkills.map(s => [s.id, s.name]));
      for (const [uuid, level] of Object.entries(initialReq)) {
        const skillName = skillMapById.get(uuid);
        if (skillName) {
          nameBasedReqs[skillName] = level;
        } else {
          console.warn(`AbilityForm: Could not find skill name for UUID ${uuid} during initialization.`);
          // Optionally handle missing skills, e.g., skip or add a placeholder
        }
      }
       console.log("AbilityForm: Converted to name-based requirements:", nameBasedReqs);
    } else if (typeof initialReq === 'string' || initialReq === null || initialReq === undefined) {
       // Simple string, null, or undefined - no skills selected initially
       console.log("AbilityForm: Initial requirement is simple string, null, or undefined:", initialReq);
       nameBasedReqs = {};
    } else {
        console.warn("AbilityForm: Unrecognized requirement format during initialization:", initialReq);
        nameBasedReqs = {}; // Default to empty if format is unknown
    }

    setSelectedSkillsByName(nameBasedReqs);
    setIsLoadingRequirements(false);

  }, [entry.requirement, allSkills, skillsLoading]);

  // Run initialization when skills are loaded or entry changes
  useEffect(() => {
    initializeRequirements();
  }, [initializeRequirements]); // Depends on the memoized callback

  // Update parent component whenever selectedSkillsByName change
  useEffect(() => {
    // Only call onChange if the requirements actually changed *after* initial load/conversion
    // We compare the current state `selectedSkillsByName` with the potentially converted initial value.
    // This avoids triggering saves just due to the format conversion on load.
    // Note: This comparison might be complex if the initial value needed conversion.
    // A simpler approach might be to only call onChange in the handler functions below,
    // but this ensures external changes to `entry.requirement` are reflected.
    // Let's stick to calling onChange here for now.
    onChange('requirement', selectedSkillsByName);

  }, [selectedSkillsByName, onChange]);
  // --- End Initialization Logic ---


  // --- Event Handlers (using skill NAME) ---
  const handleSkillCheckboxChange = (skillName: string, isChecked: boolean) => {
    if (typeof skillName !== 'string') return; // Guard against invalid input

    setSelectedSkillsByName(prev => {
      const updated = { ...prev };
      if (isChecked) {
        // Add skill with null level initially if it doesn't exist
        if (!updated.hasOwnProperty(skillName)) {
            updated[skillName] = null;
        }
      } else {
        // Remove skill
        delete updated[skillName];
      }
      return updated;
    });
  };

  const handleSkillLevelChange = (skillName: string, level: string) => {
     if (typeof skillName !== 'string') return; // Guard against invalid input

    const levelValue = level === '' ? null : parseInt(level, 10);
    // Only update if the skill is actually selected (present as a key)
    if (selectedSkillsByName.hasOwnProperty(skillName)) {
        setSelectedSkillsByName(prev => ({
            ...prev,
            [skillName]: isNaN(levelValue as number) ? null : levelValue, // Store null if NaN or empty
        }));
    }
  };
  // --- End Event Handlers ---

  // Helper to get skill ID from name for React keys
  const getSkillIdFromName = (name: string): string | undefined => {
    return allSkills.find(s => s.name === name)?.id;
  };


  return (
    <div className="space-y-4">
      {/* Name Input */}
      <div>
        <label htmlFor="ability-name" className="block text-sm font-medium text-gray-700 mb-1">
          Name
        </label>
        <input
          id="ability-name"
          type="text"
          value={entry.name || ''}
          onChange={(e) => onChange('name', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>

      {/* Description Textarea */}
      <div>
        <label htmlFor="ability-description" className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          id="ability-description"
          value={entry.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Willpower Cost Input */}
      <div>
        <label htmlFor="ability-willpower_cost" className="block text-sm font-medium text-gray-700 mb-1">
          Willpower Cost
        </label>
        <input
          id="ability-willpower_cost"
          type="number"
          value={entry.willpower_cost === null || entry.willpower_cost === undefined ? '' : entry.willpower_cost}
          onChange={(e) => onChange('willpower_cost', e.target.value === '' ? null : parseInt(e.target.value, 10))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          min="0"
        />
      </div>

      {/* Profession Input */}
      <div>
        <label htmlFor="ability-profession" className="block text-sm font-medium text-gray-700 mb-1">
          Profession (Optional)
        </label>
        <input
          id="ability-profession"
          type="text"
          value={entry.profession || ''}
          onChange={(e) => onChange('profession', e.target.value || null)}
          placeholder="Leave blank if applicable to all"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
         <p className="mt-1 text-xs text-gray-500">Specify if this ability is restricted to a certain profession.</p>
      </div>

      {/* Kin Input */}
			 <div>
        <label htmlFor="ability-kin" className="block text-sm font-medium text-gray-700 mb-1">
          Kin (Optional)
        </label>
        <input
          id="ability-kin"
          type="text"
          value={entry.kin || ''}
          onChange={(e) => onChange('kin', e.target.value || null)}
          placeholder="Leave blank if applicable to all"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
         <p className="mt-1 text-xs text-gray-500">Specify if this ability is restricted to a certain kin.</p>
      </div>

      {/* Skill Requirements Section */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Skill Requirements (Optional)
        </label>
        <details
            className="border border-gray-300 rounded-md shadow-sm overflow-hidden"
            open={isSkillsExpanded}
            onToggle={(e) => setIsSkillsExpanded((e.target as HTMLDetailsElement).open)}
        >
            <summary className="px-3 py-2 cursor-pointer bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded-t-md">
                {Object.keys(selectedSkillsByName).length > 0
                    ? `${Object.keys(selectedSkillsByName).length} skill(s) selected`
                    : "Select required skills..."}
            </summary>
            <div className="p-4 border-t border-gray-200 max-h-60 overflow-y-auto">
                {skillsLoading || isLoadingRequirements ? (
                    <div className="flex justify-center items-center py-4">
                        <LoadingSpinner size="md" />
                        <span className="ml-2 text-gray-500">Loading skills...</span>
                    </div>
                 ) : skillsError ? (
                    <ErrorMessage message={`Error loading skills: ${skillsError}`} />
                 ) : allSkills.length === 0 ? (
                    <p className="text-gray-500">No skills available.</p>
                 ) : (
                    <ul className="space-y-2">
                        {allSkills.map((skill) => {
                            // Use skill NAME for state checks and handlers
                            const skillName = skill.name;
                            const isSelected = selectedSkillsByName.hasOwnProperty(skillName);
                            const currentLevel = selectedSkillsByName[skillName]; // Can be number or null

                            return (
                                <li key={skill.id} className="flex items-center space-x-3"> {/* Use ID for key */}
                                    <input
                                        id={`skill-req-${skill.id}`} // Use ID for unique DOM id
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => handleSkillCheckboxChange(skillName, e.target.checked)} // Pass NAME
                                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                    <label htmlFor={`skill-req-${skill.id}`} className="flex-1 text-sm text-gray-700">
                                        {skill.name} {skill.attribute ? `(${skill.attribute})` : ''}
                                    </label>
                                    {isSelected && (
                                        <input
                                            type="number"
                                            min="1" // Assuming skill levels start at 1
                                            placeholder="Level (Opt.)"
                                            value={currentLevel === null || currentLevel === undefined ? '' : currentLevel}
                                            onChange={(e) => handleSkillLevelChange(skillName, e.target.value)} // Pass NAME
                                            className="w-24 px-2 py-1 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </details>
         <p className="mt-1 text-xs text-gray-500">
            Select skills required for this ability and optionally specify a minimum level. Requirements are now stored by skill name.
         </p>
         {/* Display simple string requirement if present */}
         {typeof entry.requirement === 'string' && entry.requirement && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-xs text-yellow-700">
                    <strong>Note:</strong> This ability has a non-skill requirement text: "{entry.requirement}". Saving will overwrite this if skills are selected above.
                </p>
            </div>
         )}
         {/* Display warning if requirement was UUID-based and conversion might have failed */}
         {isSkillUuidRequirement(entry.requirement) && isLoadingRequirements && (
             <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
                <p className="text-xs text-orange-700">
                    Attempting to convert legacy UUID-based requirements...
                </p>
            </div>
         )}
      </div>


      {/* Display created_at if available (read-only) */}
      {entry.created_at && (
        <div className="mt-4 pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-500">Created: {new Date(entry.created_at).toLocaleString()}</p>
        </div>
      )}
    </div>
  );
};
