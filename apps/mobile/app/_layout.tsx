import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0033A0' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800' },
        headerTitle: 'Unidos',
        contentStyle: { backgroundColor: '#f4f6fb' },
      }}
    />
  );
}
