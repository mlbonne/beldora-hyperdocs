import { Gem, Lightbulb, MapPin, User, Waypoints, type LucideIcon } from 'lucide-react';
import type { EntryType } from './types';

export interface TypeMeta {
  label: string;
  plural: string;
  icon: LucideIcon;
  blurb: string;
  defaultFields: string[];
  defaultTabs: string[];
}

export const ENTRY_TYPES: EntryType[] = ['character', 'location', 'item', 'concept', 'dynamic'];

export const TYPE_META: Record<EntryType, TypeMeta> = {
  character: {
    label: 'Character',
    plural: 'Characters',
    icon: User,
    blurb: 'A person, an animal, a god — any sentient being.',
    defaultFields: ['Species', 'Age', 'Affiliation', 'Status'],
    defaultTabs: ['Overview', 'Biography', 'Personality'],
  },
  location: {
    label: 'Location',
    plural: 'Locations',
    icon: MapPin,
    blurb: 'Any place that needs more context.',
    defaultFields: ['Region', 'Kind', 'Population', 'Ruler'],
    defaultTabs: ['Overview', 'History', 'Geography'],
  },
  item: {
    label: 'Item',
    plural: 'Items',
    icon: Gem,
    blurb: 'Any thing or object that needs more context.',
    defaultFields: ['Kind', 'Owner', 'Origin', 'Material'],
    defaultTabs: ['Overview', 'History', 'Properties'],
  },
  concept: {
    label: 'Concept',
    plural: 'Concepts',
    icon: Lightbulb,
    blurb: 'An abstraction that needs a definition.',
    defaultFields: ['Category', 'Origin', 'Known by'],
    defaultTabs: ['Definition', 'Details'],
  },
  dynamic: {
    label: 'Dynamic',
    plural: 'Dynamics',
    icon: Waypoints,
    blurb: 'A relationship between two or more things.',
    defaultFields: ['Nature', 'Status', 'Since'],
    defaultTabs: ['Overview', 'History'],
  },
};
