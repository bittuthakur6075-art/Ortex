import React from 'react';

// Deep imports (not the barrel `iconsax-react-native`) — the barrel re-exports all
// 995 icons and Metro cannot tree-shake it, which added ~4 MB to the bundle.
import Add from 'iconsax-react-native/dist/esm/Add';
import Archive from 'iconsax-react-native/dist/esm/Archive';
import ArchiveBox from 'iconsax-react-native/dist/esm/ArchiveBox';
import Copy from 'iconsax-react-native/dist/esm/Copy';
import ExportSquare from 'iconsax-react-native/dist/esm/ExportSquare';
import ArrowLeft2 from 'iconsax-react-native/dist/esm/ArrowLeft2';
import ArrowRight2 from 'iconsax-react-native/dist/esm/ArrowRight2';
import ArrowRotateLeft from 'iconsax-react-native/dist/esm/ArrowRotateLeft';
import ArrowRotateRight from 'iconsax-react-native/dist/esm/ArrowRotateRight';
import Bookmark2 from 'iconsax-react-native/dist/esm/Bookmark2';
import Calendar from 'iconsax-react-native/dist/esm/Calendar';
import Calendar1 from 'iconsax-react-native/dist/esm/Calendar1';
import Category from 'iconsax-react-native/dist/esm/Category';
import Clock from 'iconsax-react-native/dist/esm/Clock';
import CloseCircle from 'iconsax-react-native/dist/esm/CloseCircle';
import ColorSwatch from 'iconsax-react-native/dist/esm/ColorSwatch';
import DocumentText from 'iconsax-react-native/dist/esm/DocumentText';
import FingerScan from 'iconsax-react-native/dist/esm/FingerScan';
import Filter from 'iconsax-react-native/dist/esm/Filter';
import Flag from 'iconsax-react-native/dist/esm/Flag';
import Folder2 from 'iconsax-react-native/dist/esm/Folder2';
import Gallery from 'iconsax-react-native/dist/esm/Gallery';
import Google from 'iconsax-react-native/dist/esm/Google';
import HambergerMenu from 'iconsax-react-native/dist/esm/HambergerMenu';
import Hashtag from 'iconsax-react-native/dist/esm/Hashtag';
import Home2 from 'iconsax-react-native/dist/esm/Home2';
import Lock from 'iconsax-react-native/dist/esm/Lock';
import Logout from 'iconsax-react-native/dist/esm/Logout';
import Microphone2 from 'iconsax-react-native/dist/esm/Microphone2';
import More from 'iconsax-react-native/dist/esm/More';
import NotificationBing from 'iconsax-react-native/dist/esm/NotificationBing';
import Paperclip2 from 'iconsax-react-native/dist/esm/Paperclip2';
import PauseCircle from 'iconsax-react-native/dist/esm/PauseCircle';
import PlayCircle from 'iconsax-react-native/dist/esm/PlayCircle';
import ProfileCircle from 'iconsax-react-native/dist/esm/ProfileCircle';
import Refresh2 from 'iconsax-react-native/dist/esm/Refresh2';
import SearchNormal1 from 'iconsax-react-native/dist/esm/SearchNormal1';
import Setting2 from 'iconsax-react-native/dist/esm/Setting2';
import Sort from 'iconsax-react-native/dist/esm/Sort';
import Star1 from 'iconsax-react-native/dist/esm/Star1';
import TaskSquare from 'iconsax-react-native/dist/esm/TaskSquare';
import TextalignJustifyleft from 'iconsax-react-native/dist/esm/TextalignJustifyleft';
import TickCircle from 'iconsax-react-native/dist/esm/TickCircle';
import Trash from 'iconsax-react-native/dist/esm/Trash';

import { useTheme } from '@/store/ThemeContext';

/** Iconsax variants: Linear (idle) and Bold (active/filled). */
export type IconVariant = 'Linear' | 'Outline' | 'Bold' | 'Bulk' | 'Broken' | 'TwoTone';

const GLYPHS = {
  menu: HambergerMenu,
  grid: Category,
  list: TextalignJustifyleft,
  more: More,
  search: SearchNormal1,
  close: CloseCircle,
  add: Add,
  tick: TickCircle,
  star: Star1,
  pin: Bookmark2,
  folder: Folder2,
  uncategorised: ArchiveBox,
  trash: Trash,
  restore: Refresh2,
  note: DocumentText,
  checklist: TaskSquare,
  palette: ColorSwatch,
  back: ArrowLeft2,
  forward: ArrowRight2,
  sort: Sort,
  settings: Setting2,
  lock: Lock,
  fingerprint: FingerScan,
  calendar: Calendar,
  calendarDay: Calendar1,
  clock: Clock,
  reminder: NotificationBing,
  tag: Hashtag,
  flag: Flag,
  attach: Paperclip2,
  image: Gallery,
  mic: Microphone2,
  play: PlayCircle,
  pause: PauseCircle,
  filter: Filter,
  profile: ProfileCircle,
  google: Google,
  logout: Logout,
  home: Home2,
  archive: Archive,
  copy: Copy,
  share: ExportSquare,
  undo: ArrowRotateLeft,
  redo: ArrowRotateRight,
} as const;

export type IconName = keyof typeof GLYPHS;

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  variant?: IconVariant;
};

export default function Icon({ name, size = 22, color, variant = 'Linear' }: Props) {
  const t = useTheme();
  const Glyph = GLYPHS[name];
  return <Glyph size={size} color={color ?? t.text} variant={variant} />;
}
