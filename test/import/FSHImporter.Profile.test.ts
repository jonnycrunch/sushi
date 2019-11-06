import {
  assertCardRule,
  assertFixedValueRule,
  assertFlagRule,
  assertOnlyRule,
  assertValueSetRule
} from '../utils/asserts';
import { importText } from '../../src/import';
import { Code, Quantity, Ratio } from '../../src/fshtypes';

describe('FSHImporter', () => {
  describe('Profile', () => {
    describe('#sdMetadata', () => {
      it('should parse the simplest possible profile', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        `;

        const result = importText(input);
        expect(result.profiles.size).toBe(1);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.name).toBe('ObservationProfile');
        expect(profile.parent).toBe('Observation');
        // if no id is explicitly set, should default to name
        expect(profile.id).toBe('ObservationProfile');
      });

      it('should parse profile with additional metadata properties', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        Id: observation-profile
        Title: "An Observation Profile"
        Description: "A profile on Observation"
        `;

        const result = importText(input);
        expect(result.profiles.size).toBe(1);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.name).toBe('ObservationProfile');
        expect(profile.parent).toBe('Observation');
        expect(profile.id).toBe('observation-profile');
        expect(profile.title).toBe('An Observation Profile');
        expect(profile.description).toBe('A profile on Observation');
      });

      it('should properly parse a multi-string description', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        Description:
          """
          This is a multi-string description
          with a couple of paragraphs.

          This is the second paragraph.  It has bullet points w/ indentation:

          * Bullet 1
            * Bullet A
            * Bullet B
              * Bullet i
            * Bullet C
          * Bullet 2
          """
        `;

        const result = importText(input);
        expect(result.profiles.size).toBe(1);
        const profile = result.profiles.get('ObservationProfile');
        const expectedDescriptionLines = [
          'This is a multi-string description',
          'with a couple of paragraphs.',
          '',
          'This is the second paragraph.  It has bullet points w/ indentation:',
          '',
          '* Bullet 1',
          '  * Bullet A',
          '  * Bullet B',
          '    * Bullet i',
          '  * Bullet C',
          '* Bullet 2'
        ];
        expect(profile.description).toBe(expectedDescriptionLines.join('\n'));
      });

      it('should accept and translate an alias for the parent', () => {
        const input = `
        Alias: OBS = http://hl7.org/fhir/StructureDefinition/Observation

        Profile: ObservationProfile
        Parent: OBS
        `;

        const result = importText(input);
        expect(result.profiles.size).toBe(1);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.name).toBe('ObservationProfile');
        expect(profile.parent).toBe('http://hl7.org/fhir/StructureDefinition/Observation');
      });
    });

    describe('#cardRule', () => {
      it('should parse simple card rules', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * category 1..5
        * value[x] 1..1
        * component 2..*
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(3);
        assertCardRule(profile.rules[0], 'category', 1, 5);
        assertCardRule(profile.rules[1], 'value[x]', 1, 1);
        assertCardRule(profile.rules[2], 'component', 2, '*');
      });

      it('should parse card rules w/ flags', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * category 1..5 MS
        * value[x] 1..1 ?!
        * component 2..* SU
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(6);
        assertCardRule(profile.rules[0], 'category', 1, 5);
        assertFlagRule(profile.rules[1], 'category', true, undefined, undefined);
        assertCardRule(profile.rules[2], 'value[x]', 1, 1);
        assertFlagRule(profile.rules[3], 'value[x]', undefined, undefined, true);
        assertCardRule(profile.rules[4], 'component', 2, '*');
        assertFlagRule(profile.rules[5], 'component', undefined, true, undefined);
      });

      it('should parse card rules w/ multiple flags', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * category 1..5 MS ?!
        * value[x] 1..1 ?! SU
        * component 2..* SU MS
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(6);
        assertCardRule(profile.rules[0], 'category', 1, 5);
        assertFlagRule(profile.rules[1], 'category', true, undefined, true);
        assertCardRule(profile.rules[2], 'value[x]', 1, 1);
        assertFlagRule(profile.rules[3], 'value[x]', undefined, true, true);
        assertCardRule(profile.rules[4], 'component', 2, '*');
        assertFlagRule(profile.rules[5], 'component', true, true, undefined);
      });
    });

    describe('#flagRule', () => {
      it('should parse single-path single-value flag rules', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * category MS
        * value[x] ?!
        * component SU
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(3);
        assertFlagRule(profile.rules[0], 'category', true, undefined, undefined);
        assertFlagRule(profile.rules[1], 'value[x]', undefined, undefined, true);
        assertFlagRule(profile.rules[2], 'component', undefined, true, undefined);
      });

      it('should parse single-path multi-value flag rules', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * category MS ?!
        * value[x] ?! SU
        * component MS SU ?!
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(3);
        assertFlagRule(profile.rules[0], 'category', true, undefined, true);
        assertFlagRule(profile.rules[1], 'value[x]', undefined, true, true);
        assertFlagRule(profile.rules[2], 'component', true, true, true);
      });

      it('should parse multi-path single-value flag rules', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * category, value[x], component MS
        * subject, focus ?!
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(5);
        assertFlagRule(profile.rules[0], 'category', true, undefined, undefined);
        assertFlagRule(profile.rules[1], 'value[x]', true, undefined, undefined);
        assertFlagRule(profile.rules[2], 'component', true, undefined, undefined);
        assertFlagRule(profile.rules[3], 'subject', undefined, undefined, true);
        assertFlagRule(profile.rules[4], 'focus', undefined, undefined, true);
      });

      it('should parse multi-path multi-value flag rules', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * category, value[x], component MS SU
        * subject, focus ?! SU
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(5);
        assertFlagRule(profile.rules[0], 'category', true, true, undefined);
        assertFlagRule(profile.rules[1], 'value[x]', true, true, undefined);
        assertFlagRule(profile.rules[2], 'component', true, true, undefined);
        assertFlagRule(profile.rules[3], 'subject', undefined, true, true);
        assertFlagRule(profile.rules[4], 'focus', undefined, true, true);
      });
    });

    describe('#valueSetRule', () => {
      it('should parse value set rules w/ names and strengths', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * category from CategoryValueSet (required)
        * code from CodeValueSet (extensible)
        * valueCodeableConcept from ValueValueSet (preferred)
        * component.code from ComponentCodeValueSet (example)
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(4);
        assertValueSetRule(profile.rules[0], 'category', 'CategoryValueSet', 'required');
        assertValueSetRule(profile.rules[1], 'code', 'CodeValueSet', 'extensible');
        assertValueSetRule(profile.rules[2], 'valueCodeableConcept', 'ValueValueSet', 'preferred');
        assertValueSetRule(profile.rules[3], 'component.code', 'ComponentCodeValueSet', 'example');
      });

      it('should parse value set rules w/ urls and strengths', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * category from http://example.org/fhir/ValueSet/CategoryValueSet (required)
        * code from http://example.org/fhir/ValueSet/CodeValueSet (extensible)
        * valueCodeableConcept from http://example.org/fhir/ValueSet/ValueValueSet (preferred)
        * component.code from http://example.org/fhir/ValueSet/ComponentCodeValueSet (example)
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(4);
        assertValueSetRule(
          profile.rules[0],
          'category',
          'http://example.org/fhir/ValueSet/CategoryValueSet',
          'required'
        );
        assertValueSetRule(
          profile.rules[1],
          'code',
          'http://example.org/fhir/ValueSet/CodeValueSet',
          'extensible'
        );
        assertValueSetRule(
          profile.rules[2],
          'valueCodeableConcept',
          'http://example.org/fhir/ValueSet/ValueValueSet',
          'preferred'
        );
        assertValueSetRule(
          profile.rules[3],
          'component.code',
          'http://example.org/fhir/ValueSet/ComponentCodeValueSet',
          'example'
        );
      });

      it('should accept and translate aliases for value set URLs', () => {
        const input = `
        Alias: CAT = http://example.org/fhir/ValueSet/CategoryValueSet
        Alias: CODE = http://example.org/fhir/ValueSet/CodeValueSet
        Alias: VALUE = http://example.org/fhir/ValueSet/ValueValueSet
        Alias: COMP = http://example.org/fhir/ValueSet/ComponentCodeValueSet

        Profile: ObservationProfile
        Parent: Observation
        * category from CAT (required)
        * code from CODE (extensible)
        * valueCodeableConcept from VALUE (preferred)
        * component.code from COMP (example)
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(4);
        assertValueSetRule(
          profile.rules[0],
          'category',
          'http://example.org/fhir/ValueSet/CategoryValueSet',
          'required'
        );
        assertValueSetRule(
          profile.rules[1],
          'code',
          'http://example.org/fhir/ValueSet/CodeValueSet',
          'extensible'
        );
        assertValueSetRule(
          profile.rules[2],
          'valueCodeableConcept',
          'http://example.org/fhir/ValueSet/ValueValueSet',
          'preferred'
        );
        assertValueSetRule(
          profile.rules[3],
          'component.code',
          'http://example.org/fhir/ValueSet/ComponentCodeValueSet',
          'example'
        );
      });

      it('should parse value set rules w/ no strength and default to required', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * category from CategoryValueSet
        * code from http://example.org/fhir/ValueSet/CodeValueSet
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(2);
        assertValueSetRule(profile.rules[0], 'category', 'CategoryValueSet', 'required');
        assertValueSetRule(
          profile.rules[1],
          'code',
          'http://example.org/fhir/ValueSet/CodeValueSet',
          'required'
        );
      });
    });

    describe('#fixedValueRule', () => {
      it('should parse fixed value boolean rule', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * valueBoolean = true
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        assertFixedValueRule(profile.rules[0], 'valueBoolean', true);
      });

      it('should parse fixed value number rule', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * valueDecimal = 1.23
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        assertFixedValueRule(profile.rules[0], 'valueDecimal', 1.23);
      });

      it('should parse fixed value string rule', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * valueString = "hello world"
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        assertFixedValueRule(profile.rules[0], 'valueString', 'hello world');
      });

      it('should parse fixed value multi-line string rule', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * valueString = """
            hello
            world
            """
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        assertFixedValueRule(profile.rules[0], 'valueString', 'hello\nworld');
      });

      it('should parse fixed value date rule', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * valueDateTime = 2019-11-01T12:30:01.999Z
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        // For now, treating dates like strings
        assertFixedValueRule(profile.rules[0], 'valueDateTime', '2019-11-01T12:30:01.999Z');
      });

      it('should parse fixed value time rule', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * valueTime = 12:30:01.999-05:00
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        // For now, treating dates like strings
        assertFixedValueRule(profile.rules[0], 'valueTime', '12:30:01.999-05:00');
      });

      it('should parse fixed value code rule', () => {
        const input = `
        Alias: LOINC = http://loinc.org

        Profile: ObservationProfile
        Parent: Observation
        * status = #final
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        assertFixedValueRule(profile.rules[0], 'status', new Code('final'));
      });

      it('should parse fixed value CodeableConcept rule', () => {
        const input = `
        Alias: LOINC = http://loinc.org

        Profile: ObservationProfile
        Parent: Observation
        * valueCodeableConcept = LOINC#718-7 "Hemoglobin [Mass/volume] in Blood"
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        assertFixedValueRule(
          profile.rules[0],
          'valueCodeableConcept',
          new Code('718-7', 'http://loinc.org', 'Hemoglobin [Mass/volume] in Blood')
        );
      });

      it('should parse fixed value Quantity rule', () => {
        const input = `

        Profile: ObservationProfile
        Parent: Observation
        * valueQuantity = 1.5 'mm'
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        assertFixedValueRule(
          profile.rules[0],
          'valueQuantity',
          new Quantity(1.5, new Code('mm', 'http://unitsofmeasure.org'))
        );
      });

      it('should parse fixed value Ratio rule', () => {
        const input = `

        Profile: ObservationProfile
        Parent: Observation
        * valueRatio = 130 'mg' : 1 'dL'
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        assertFixedValueRule(
          profile.rules[0],
          'valueRatio',
          new Ratio(
            new Quantity(130, new Code('mg', 'http://unitsofmeasure.org')),
            new Quantity(1, new Code('dL', 'http://unitsofmeasure.org'))
          )
        );
      });

      it('should parse fixed value Ratio rule w/ numeric numerator', () => {
        const input = `

        Profile: ObservationProfile
        Parent: Observation
        * valueRatio = 130 : 1 'dL'
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        assertFixedValueRule(
          profile.rules[0],
          'valueRatio',
          new Ratio(new Quantity(130), new Quantity(1, new Code('dL', 'http://unitsofmeasure.org')))
        );
      });

      it('should parse fixed value Ratio rule w/ numeric denominator', () => {
        const input = `

        Profile: ObservationProfile
        Parent: Observation
        * valueRatio = 130 'mg' : 1
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        assertFixedValueRule(
          profile.rules[0],
          'valueRatio',
          new Ratio(new Quantity(130, new Code('mg', 'http://unitsofmeasure.org')), new Quantity(1))
        );
      });

      it('should parse fixed value Ratio rule w/ numeric numerator and denominator', () => {
        const input = `

        Profile: ObservationProfile
        Parent: Observation
        * valueRatio = 130 : 1
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        assertFixedValueRule(
          profile.rules[0],
          'valueRatio',
          new Ratio(new Quantity(130), new Quantity(1))
        );
      });
    });

    describe('#onlyRule', () => {
      it('should parse an only rule with one type', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * value[x] only Quantity
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        assertOnlyRule(profile.rules[0], 'value[x]', 'Quantity');
      });

      it('should parse an only rule with multiple type', () => {
        const input = `
        Profile: ObservationProfile
        Parent: Observation
        * value[x] only Quantity or CodeableConcept or string
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        assertOnlyRule(profile.rules[0], 'value[x]', 'Quantity', 'CodeableConcept', 'string');
      });

      it('should allow and translate aliases for only types', () => {
        const input = `
        Alias: QUANTITY = http://hl7.org/fhir/StructureDefinition/Quantity
        Alias: CODING = http://hl7.org/fhir/StructureDefinition/Coding

        Profile: ObservationProfile
        Parent: Observation
        * value[x] only CodeableConcept or CODING or string or QUANTITY
        `;

        const result = importText(input);
        const profile = result.profiles.get('ObservationProfile');
        expect(profile.rules).toHaveLength(1);
        assertOnlyRule(
          profile.rules[0],
          'value[x]',
          'CodeableConcept',
          'http://hl7.org/fhir/StructureDefinition/Coding',
          'string',
          'http://hl7.org/fhir/StructureDefinition/Quantity'
        );
      });
    });
  });
});