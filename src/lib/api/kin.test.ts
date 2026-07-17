import { getKinAbilityNames } from './kin';

describe('getKinAbilityNames', () => {
  it('prefers the canonical heroic ability field', () => {
    expect(getKinAbilityNames({
      heroic_ability: 'Adaptable, Inner Peace',
      abilities: [{ description: 'Legacy value' }],
    })).toEqual(['Adaptable', 'Inner Peace']);
  });

  it('supports kin abilities stored in the JSON abilities field', () => {
    expect(getKinAbilityNames({
      heroic_ability: null,
      abilities: [
        { description: 'Webbed Feet', willpower_points: 0 },
        { name: 'Ill-Tempered', willpower_points: 3 },
      ],
    })).toEqual(['Webbed Feet', 'Ill-Tempered']);
  });

  it('supports legacy strings and removes duplicates', () => {
    expect(getKinAbilityNames({
      heroic_ability: '',
      abilities: ['Hunting Instinct'],
      kin_abilities: [{ description: 'Hunting Instinct' }],
    })).toEqual(['Hunting Instinct']);
  });
});
