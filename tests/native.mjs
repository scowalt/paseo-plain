export const Text = 'Text';
export const View = 'View';
export const Pressable = 'Pressable';
export const ScrollView = 'ScrollView';
export const TextInput = 'TextInput';
export const Linking = { openURL: async (url) => globalThis.plainTestOpenURL?.(url) };
export const Platform = { OS: 'web' };
