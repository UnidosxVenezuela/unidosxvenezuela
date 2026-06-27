import { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function entrar() {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMsg(error ? error.message : 'Sesión iniciada');
  }

  return (
    <View style={styles.c}>
      <Text style={styles.h}>Plataforma Unidos</Text>
      <TextInput style={styles.i} placeholder="Correo" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={styles.i} placeholder="Contraseña" secureTextEntry value={password} onChangeText={setPassword} />
      <Button title="Entrar" onPress={entrar} />
      {msg && <Text style={{ marginTop: 12 }}>{msg}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  h: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  i: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
});
