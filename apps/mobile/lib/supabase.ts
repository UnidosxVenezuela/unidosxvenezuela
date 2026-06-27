// Cliente Supabase para la app móvil (sesión persistida con SecureStore).
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { crearClienteUnidos } from '@unidos/supabase-client';

export const supabase = crearClienteUnidos({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL!,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  authStorage: AsyncStorage,
});
