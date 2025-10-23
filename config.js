// Supabase Configuration
//
// INSTRUKCJA KONFIGURACJI:
//
// 1. Utwórz darmowe konto na https://supabase.com
// 2. Utwórz nowy projekt
// 3. W panelu Supabase przejdź do Settings > API
// 4. Skopiuj "Project URL" i "anon/public key"
// 5. Wklej je poniżej (odkomentuj i uzupełnij)
// 6. Wykonaj konfigurację bazy danych (patrz README.md)

// ODKOMENTUJ I UZUPEŁNIJ PONIŻSZE LINIE:
window.SUPABASE_CONFIG = {
  url: "https://kocbevfdxmrdttvrtsep.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvY2JldmZkeG1yZHR0dnJ0c2VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNDk1MjcsImV4cCI6MjA3NjgyNTUyN30.nPGcQWPv6kQX1DzZn3I_KyuyHjbwY4XmbLYR-ismmzE",
};

// UWAGA: Jeśli nie skonfigurujesz Supabase, aplikacja będzie działać
// w trybie localStorage (dane tylko w przeglądarce, bez chmury).

// HASŁO ADMINISTRATORA:
// Domyślne hasło to: admin123
// Aby je zmienić, edytuj linię 5 w pliku script.js:
// const ADMIN_PASSWORD = "twoje-nowe-haslo";

// Po skonfigurowaniu Supabase, przejdź do SQL Editor i wykonaj poniższe zapytania:

/*

-- 1. Utwórz tabelę nauczycieli
CREATE TABLE teachers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  description TEXT,
  photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Utwórz tabelę mediów
CREATE TABLE media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('ai', 'natural')),
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Utwórz tabelę cytatów
CREATE TABLE quotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
  quote_text TEXT NOT NULL,
  quote_author TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Utwórz bucket dla plików (Storage)
-- Przejdź do Storage w panelu Supabase i utwórz bucket o nazwie "teacher-media"
-- Ustaw bucket jako PUBLIC (w ustawieniach bucket)

-- 5. Włącz Row Level Security (RLS) - OPCJONALNIE dla większego bezpieczeństwa
-- Jeśli chcesz, aby każdy mógł dodawać i przeglądać dane (prosty przypadek):

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all operations for all users" ON teachers
  FOR ALL USING (true);

CREATE POLICY "Enable all operations for all users" ON media
  FOR ALL USING (true);

CREATE POLICY "Enable all operations for all users" ON quotes
  FOR ALL USING (true);

-- Dla Storage bucket, ustaw odpowiednie polityki w panelu Supabase:
-- Storage > teacher-media > Policies
-- Dodaj policy pozwalającą na INSERT, UPDATE, SELECT, DELETE dla wszystkich

*/

console.log(
  "Config.js loaded. Check this file for Supabase configuration instructions."
);
