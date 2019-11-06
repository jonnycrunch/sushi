import capitalize from 'lodash/capitalize';
import cloneDeep from 'lodash/cloneDeep';
import { ElementDefinition, ElementDefinitionType, ResolveFn } from './ElementDefinition';
import { Meta } from './specialTypes';
import { Identifier, CodeableConcept, Coding, Narrative, Resource, Extension } from './dataTypes';
import { ContactDetail, UsageContext } from './metaDataTypes';

/**
 * A class representing a FHIR R4 StructureDefinition.  For the most part, each allowable property in a StructureDefinition
 * is represented via a get/set in this class, and the value is expected to be the FHIR-compliant JSON that would go
 * in the StructureDefinition JSON file (w/ translation for R3).
 *
 * The snapshot and differential, however, do not have their own properties, but rather are represented as an
 * `elements` get/set property, whose value is a list of `ElementDefinition` instances.
 *
 * @see {@link http://hl7.org/fhir/R4/structuredefinition.html|FHIR StructureDefinition}
 */
export class StructureDefinition {
  id: string;
  meta: Meta;
  implicitRules: string;
  language: string;
  text: Narrative;
  contained: Resource[];
  extension: Extension[];
  modifierExtension: Extension[];
  url: string;
  identifier: Identifier[];
  version: string;
  name: string;
  title: string;
  status: string;
  experimental: boolean;
  date: string;
  publisher: string;
  contact: ContactDetail[];
  description: string;
  useContext: UsageContext[];
  jurisdiction: CodeableConcept[];
  purpose: string;
  copyright: string;
  keyword: Coding[];
  fhirVersion: string;
  mapping: StructureDefinitionMapping[];
  kind: string;
  abstract: boolean;
  context: StructureDefinitionContext[];
  contextInvariant: string[];
  type: string;
  baseDefinition: string;
  derivation: string;

  /**
   * The StructureDefinition's elements.  The returned array should not be pushed to directly.  Instead, use
   * the {@link addElement} or {@link addElements} function
   */
  elements: ElementDefinition[];

  /**
   * Constructs a StructureDefinition with a root element.
   */
  constructor() {
    // Every structure definition needs a root element
    const root = new ElementDefinition('');
    root.structDef = this;
    root.min = 0;
    root.max = '*';
    root.mustSupport = false;
    root.isModifier = false;
    root.isSummary = false;
    this.elements = [root];
  }

  /**
   * Adds an ElementDefinition to the StructureDefinition's elements, inserting it into the proper location based
   * on its ID.  This should be used rather than pushing directly to the elements array.
   * @param {ElementDefinition} element - the ElementDefinition to add
   */
  addElement(element: ElementDefinition) {
    let i = 0;
    let lastMatchId = '';
    for (; i < this.elements.length; i++) {
      const currentId = this.elements[i].id;
      if (element.id.startsWith(currentId)) {
        lastMatchId = currentId;
      } else if (!currentId.startsWith(lastMatchId)) {
        break;
      }
    }
    this.elements.splice(i, 0, element);
  }

  /**
   * Adds an array of ElementDefinitions to the StructureDefinition, inserting each one into the proper location based
   * on its ID.  This should be used rather than pushing directly to the elements array.
   * @param {ElementDefinition[]} elements - the array of ElementDefinitions to add
   */
  addElements(elements: ElementDefinition[] = []) {
    elements.forEach(e => this.addElement(e));
  }

  /**
   * Finds an element by its id.
   * @param {string} id
   * @returns {ElementDefinition} the found element (or undefined if it is not found)
   */
  findElement(id: string): ElementDefinition {
    if (!id) {
      return;
    }
    return this.elements.find(e => e.id === id);
  }

  /**
   * Finds an element by a FSH-compatible path
   * @param {string} path - The FSH path
   * @param {resolve} ResolveFn - a function that can resolve a type to a StructureDefinition instance
   * @returns {ElementDefinition} - The found element (or undefined if it is not found)
   */
  findElementByPath(path: string, resolve: ResolveFn = () => undefined): ElementDefinition {
    // If the path already exists, get it and return the match
    // If !path just return the base parent element
    const fullPath = path ? `${this.type}.${path}` : this.type;
    const match = this.elements.find(e => e.path === fullPath);
    if (match != null) {
      return match;
    }

    // Parse the FSH Path into a form we can work with
    const parsedPath = this.parseFSHPath(path);

    let fhirPathString = this.type;
    let matchingElements = this.elements;
    let newMatchingElements: ElementDefinition[] = [];
    // Iterate over the path, filtering out elements that do not match
    for (const pathPart of parsedPath) {
      // Add the next part to the path, and see if we have matches on it
      fhirPathString += `.${pathPart.base}`;
      newMatchingElements = matchingElements.filter(e => e.path.startsWith(fhirPathString));

      if (newMatchingElements.length === 0) {
        // If we fail to find any matches, first try to find the appropriate [x] element
        // Ex: valueString -> value[x]
        const newSlice = this.sliceMatchingValueX(fhirPathString, matchingElements);
        if (newSlice) {
          newMatchingElements.push(newSlice);
          fhirPathString = newSlice.path;
        }
      }

      // TODO: If path is A.B.C, and we unfold B, but C is invalid, the unfolded
      // elements are still on the structDef. We may want to change this to remove the elements
      // upon error
      if (newMatchingElements.length === 0 && matchingElements.length === 1) {
        // If we did not find an [x] element, and there was previously only one match,
        // We want to unfold that match and dig deeper into it
        const newElements = matchingElements[0].unfold(resolve);
        if (newElements.length > 0) {
          // Only get the children that match our path
          newMatchingElements = newElements.filter(e => e.path.startsWith(fhirPathString));
        }
      }

      if (newMatchingElements.length > 0) {
        // We succeeded in finding some matches, set them and keep going
        matchingElements = newMatchingElements;
      } else {
        // We got to a point where we couldn't find any matches, just return
        return;
      }

      // After getting matches based on the 'base' part, we now filter according to 'brackets'
      if (pathPart.brackets) {
        const sliceElement = this.findMatchingSlice(pathPart, matchingElements);
        if (sliceElement) {
          matchingElements = [sliceElement, ...sliceElement.children()];
        } else {
          // If we didn't find a matching sliceElement, there must be a reference
          const matchingRefElement = this.findMatchingRef(pathPart, matchingElements);
          if (matchingRefElement) {
            matchingElements = [matchingRefElement, ...matchingRefElement.children()];
          } else {
            // The bracket parts couldn't be resolved to a slice or a ref, so we failed to find an element
            return;
          }
        }
      }
    }

    // We could still have child elements that are matching, if so filter them out now
    matchingElements = matchingElements.filter(e => e.path === fhirPathString);
    // If we have one and only one match, return it, else return undefined
    return matchingElements.length === 1 ? matchingElements[0] : undefined;
  }

  /**
   * Creates a new element and adds it to the StructureDefinition elements.
   * @param {string} name - the name of the element to create (which will be appended to the element ID)
   * @returns {ElementDefinition} the new ElementDefinition
   */
  newElement(name = '$UNKNOWN'): ElementDefinition {
    const el = this.elements[0].newChildElement(name);
    this.addElement(el);
    return el;
  }

  /**
   * Exports the StructureDefinition to a properly formatted FHIR JSON representation.
   * @returns {any} the FHIR JSON representation of the StructureDefinition
   */
  toJSON(): any {
    const j: LooseStructDefJSON = { resourceType: 'StructureDefinition' };
    // First handle properties that are just straight translations to JSON
    for (const prop of PROPS) {
      // @ts-ignore
      if (this[prop] !== undefined) {
        // @ts-ignore
        j[prop] = cloneDeep(this[prop]);
      }
    }
    // Now handle snapshot and differential
    j.snapshot = { element: this.elements.map(e => e.toJSON()) };
    j.differential = {
      element: this.elements.filter(e => e.hasDiff()).map(e => e.calculateDiff().toJSON())
    };

    return j;
  }

  /**
   * Constructs a new StructureDefinition representing the passed in JSON.  The JSON that is passed in must be a
   * properly formatted FHIR 3.0.1 StructureDefinition JSON.
   * @param {any} json - the FHIR 3.0.1 JSON representation of a StructureDefinition to construct
   * @returns {StructureDefinition} a new StructureDefinition instance representing the passed in JSON
   */
  static fromJSON(json: LooseStructDefJSON): StructureDefinition {
    const sd = new StructureDefinition();
    // First handle properties that are just straight translations from JSON
    for (const prop of PROPS) {
      // @ts-ignore
      if (json[prop] !== undefined) {
        // @ts-ignore
        sd[prop] = cloneDeep(json[prop]);
      }
    }
    // Now handle the snapshots and (for now) just throw away the differential
    sd.elements.length = 0;
    if (json.snapshot && json.snapshot.element) {
      for (const el of json.snapshot.element) {
        const ed = ElementDefinition.fromJSON(el);
        ed.structDef = sd;
        sd.elements.push(ed);
      }
    }
    return sd;
  }

  /**
   * Parses a FSH Path into a more easily usable form
   * @param {string} fshPath - A syntactically valid path in FSH
   * @returns {PathPart[]} an array of PathParts that is easier to work with
   */
  private parseFSHPath(fshPath: string): PathPart[] {
    const pathParts: PathPart[] = [];
    const splitPath = fshPath.split('.');
    for (const pathPart of splitPath) {
      const splitPathPart = pathPart.split('[');
      if (splitPathPart.length === 1 || pathPart.endsWith('[x]')) {
        // There are no brackets, or the brackets are for a choice, so just push on the name
        pathParts.push({ base: pathPart });
      } else {
        // We have brackets, let's  save the bracket info
        const fhirPathBase = splitPathPart[0];
        // Get the bracket elements and slice off the trailing ']'
        const brackets = splitPathPart.slice(1).map(s => s.slice(0, -1));
        pathParts.push({ base: fhirPathBase, brackets: brackets });
      }
    }
    return pathParts;
  }

  /**
   * Looks for a matching choice element and if found slices it, adds the slices to the structdef
   * and then returns the newly created slice.
   * @param {string} fhirPath - The path in FHIR to match with
   * @param {ElementDefinition[]} elements - The set of elements to search through
   * @returns {ElementDefinition} - The new slice element if found, else undefined
   */
  private sliceMatchingValueX(fhirPath: string, elements: ElementDefinition[]): ElementDefinition {
    let matchingType: ElementDefinitionType;
    const matchingXElement = elements.find(e => {
      if (e.path.endsWith('[x]')) {
        for (const t of e.type) {
          if (`${e.path.slice(0, -3)}${capitalize(t.code)}` === fhirPath) {
            matchingType = t;
            return true;
          }
        }
      }
    });
    if (matchingXElement) {
      // If we find a matching [x] element, we need to slice it to create the child element
      // NOTE: The spec is somewhat incosistent on handling choice slicing, we decided on this
      // approach per consistency with 4.0.1 observation-vitalsigns profiles and per this post
      // https://blog.fire.ly/2019/09/13/type-slicing-in-fhir-r4/.
      matchingXElement.sliceIt('type', '$this', false, 'open');
      // Get the sliceName for the new element
      const sliceName = fhirPath.slice(fhirPath.lastIndexOf('.') + 1);
      const newSlice = matchingXElement.addSlice(sliceName, matchingType);
      return newSlice;
    }
    return;
  }

  /**
   * Looks for a slice within the set of elements that matches the fhirPath
   * @param {PathPart} pathPart - The path to match sliceName against
   * @param {ElementDefinition[]} elements - The set of elements to search through
   * @returns {ElementDefinition} - The sliceElement if found, else undefined
   */
  private findMatchingSlice(pathPart: PathPart, elements: ElementDefinition[]): ElementDefinition {
    // NOTE: This function will assume the 'brackets' field contains information about slices. Even
    // if you search for foo[sliceName][refName], this will try to find a re-slice
    // sliceName/refName. To find the matching element for foo[sliceName][refName], you must
    // use the findMatchingRef function. Be aware of this ambiguity in the bracket path syntax.
    return elements.find(e => e.sliceName === pathPart.brackets.join('/'));
  }

  /**
   * Looks for a Reference type element within the set of elements that matches the fhirPath
   * @param {PathPart} pathPart - The path to match the Reference type elements against
   * @param {ElementDefinition[]} elements - The set of elements to search through
   * @returns {ElementDefinition} - The Reference type element if found, else undefined
   */
  private findMatchingRef(pathPart: PathPart, elements: ElementDefinition[]): ElementDefinition {
    const matchingRefElement = elements.find(e => {
      // If we have foo[a][b][c], and c is the ref, we need to find an element with sliceName = a/b
      if (
        pathPart.brackets.length === 1 ||
        e.sliceName === pathPart.brackets.slice(0, -1).join('/')
      ) {
        for (const t of e.type) {
          return (
            t.code === 'Reference' &&
            t.targetProfile &&
            t.targetProfile.find(tp => {
              const refName = pathPart.brackets.slice(-1)[0];
              // Slice to get last part of url
              // http://hl7.org/fhir/us/core/StructureDefinition/profile|3.0.0 -> profile|3.0.0
              let tpRefName = tp.split('/').slice(-1)[0];
              // Slice to get rid of version, profile|3.0.0 -> profile
              tpRefName = tpRefName.split('|')[0];
              return tpRefName === refName;
            })
          );
        }
      }
    });
    return matchingRefElement;
  }
}

export type StructureDefinitionMapping = {
  identity: string;
  uri?: string;
  name?: string;
  comment?: string;
};

export type StructureDefinitionContext = {
  type: string;
  expression: string;
};

type PathPart = {
  base: string;
  brackets?: string[];
};

/**
 * A barebones and lenient definition of StructureDefinition JSON
 */
interface LooseStructDefJSON {
  resourceType: string;
  snapshot?: { element: any[] };
  differential?: { element: any[] };
  // [key: string]: any;
}

/**
 * The list of StructureDefinition properties used when importing/exporting FHIR JSON.
 */
const PROPS = [
  'id',
  'meta',
  'implicitRules',
  'language',
  'text',
  'contained',
  'extension',
  'modifierExtension',
  'url',
  'identifier',
  'version',
  'name',
  'title',
  'status',
  'experimental',
  'date',
  'publisher',
  'contact',
  'description',
  'useContext',
  'jurisdiction',
  'purpose',
  'copyright',
  'keyword',
  'fhirVersion',
  'mapping',
  'kind',
  'abstract',
  'context',
  'contextInvariant',
  'type',
  'baseDefinition',
  'derivation'
];