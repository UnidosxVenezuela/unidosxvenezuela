// Variables EXPO_PUBLIC_* incrustadas por Expo en build (Babel).
// Declaración mínima para que tsc reconozca process.env sin @types/node.
declare const process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
    [key: string]: string | undefined;
  };
};
