export type SeedExercise = {
  name: string;
  muscleGroup: string;
  primaryMuscle: string;
  secondaryMuscles: string;
  equipment: string;
  trainingEnvironment: 'gym' | 'home' | 'calisthenics';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  sets: number;
  reps: number;
  restSeconds: number;
  notes: string;
};

type MuscleProfile = {
  muscle: string;
  group: string;
  secondary: string;
  baseSets: number;
  baseReps: number;
  baseRest: number;
  movements: string[];
};

const PROFILES: MuscleProfile[] = [
  {
    muscle: 'Pecho',
    group: 'Pecho',
    secondary: 'Triceps, Deltoides anteriores',
    baseSets: 4,
    baseReps: 8,
    baseRest: 110,
    movements: ['Press horizontal', 'Press inclinado', 'Aperturas', 'Fondos', 'Push up'],
  },
  {
    muscle: 'Espalda',
    group: 'Espalda',
    secondary: 'Biceps, Deltoides posteriores',
    baseSets: 4,
    baseReps: 10,
    baseRest: 100,
    movements: ['Remo', 'Jalon vertical', 'Dominada', 'Pull over', 'Remo invertido'],
  },
  {
    muscle: 'Hombros',
    group: 'Hombros',
    secondary: 'Trapecio, Triceps',
    baseSets: 4,
    baseReps: 12,
    baseRest: 80,
    movements: ['Press vertical', 'Elevacion lateral', 'Elevacion frontal', 'Face pull', 'Pike press'],
  },
  {
    muscle: 'Biceps',
    group: 'Biceps',
    secondary: 'Antebrazos',
    baseSets: 3,
    baseReps: 12,
    baseRest: 70,
    movements: ['Curl supino', 'Curl martillo', 'Curl concentrado', 'Curl alterno', 'Chin up asistida'],
  },
  {
    muscle: 'Triceps',
    group: 'Triceps',
    secondary: 'Pecho, Deltoides anteriores',
    baseSets: 3,
    baseReps: 12,
    baseRest: 70,
    movements: ['Extension por encima', 'Press cerrado', 'Fondos de triceps', 'Jalon de triceps', 'Patada de triceps'],
  },
  {
    muscle: 'Pierna',
    group: 'Pierna',
    secondary: 'Gluteos, Core',
    baseSets: 4,
    baseReps: 10,
    baseRest: 120,
    movements: ['Sentadilla', 'Prensa', 'Zancada', 'Step up', 'Sentadilla frontal'],
  },
  {
    muscle: 'Isquios',
    group: 'Isquios',
    secondary: 'Gluteos, Core',
    baseSets: 4,
    baseReps: 9,
    baseRest: 120,
    movements: ['Peso muerto rumano', 'Curl femoral', 'Buenos dias', 'Puente femoral', 'Nordic curl'],
  },
  {
    muscle: 'Gluteos',
    group: 'Gluteos',
    secondary: 'Isquios, Core',
    baseSets: 4,
    baseReps: 10,
    baseRest: 100,
    movements: ['Hip thrust', 'Patada de gluteo', 'Abduccion', 'Sentadilla sumo', 'Puente de gluteo'],
  },
  {
    muscle: 'Core',
    group: 'Core',
    secondary: 'Lumbares, Oblicuos',
    baseSets: 3,
    baseReps: 15,
    baseRest: 50,
    movements: ['Plancha', 'Crunch', 'Elevacion de piernas', 'Ab wheel', 'Hollow hold'],
  },
  {
    muscle: 'Cardio',
    group: 'Cardio',
    secondary: 'Pierna, Core',
    baseSets: 1,
    baseReps: 20,
    baseRest: 30,
    movements: ['Cinta', 'Remo ergometro', 'Bicicleta', 'Sprints', 'Comba'],
  },
  {
    muscle: 'Full body',
    group: 'Full body',
    secondary: 'Core, Pierna, Hombros',
    baseSets: 4,
    baseReps: 12,
    baseRest: 90,
    movements: ['Burpee', 'Thruster', 'Clean and press', 'Bear crawl', 'Man maker'],
  },
];

const VARIANTS = ['clasico', 'pausado', 'tempo', 'explosivo', 'unilateral', 'con isometria'] as const;

const EQUIPMENT_BY_ENVIRONMENT: Record<SeedExercise['trainingEnvironment'], string[]> = {
  gym: ['barra', 'mancuernas', 'polea', 'maquina', 'kettlebell'],
  home: ['mancuernas', 'banda', 'mochila lastrada', 'peso corporal', 'silla'],
  calisthenics: ['barra de dominadas', 'anillas', 'paralelas', 'peso corporal', 'banda'],
};

const ENVIRONMENT_LABEL: Record<SeedExercise['trainingEnvironment'], string> = {
  gym: 'gimnasio',
  home: 'casa',
  calisthenics: 'calistenia',
};

const DIFFICULTY_BY_VARIANT: Record<(typeof VARIANTS)[number], SeedExercise['difficulty']> = {
  clasico: 'beginner',
  pausado: 'intermediate',
  tempo: 'intermediate',
  explosivo: 'advanced',
  unilateral: 'advanced',
  'con isometria': 'intermediate',
};

/**
 * Genera el catálogo global de ejercicios.
 *
 * El nombre incluye el entorno porque tres entornos comparten equipamiento
 * ("mancuernas" está en gym y en casa, "banda" en casa y en calistenia). Sin él,
 * la clave única por nombre descartaba silenciosamente las variantes de casa y
 * calistenia, y el filtro por entorno devolvía resultados incompletos.
 */
export function buildExerciseLibrarySeeds(): SeedExercise[] {
  const generated: SeedExercise[] = [];
  const seen = new Set<string>();

  for (const profile of PROFILES) {
    for (const movement of profile.movements) {
      for (const environment of Object.keys(EQUIPMENT_BY_ENVIRONMENT) as SeedExercise['trainingEnvironment'][]) {
        for (const equipment of EQUIPMENT_BY_ENVIRONMENT[environment]) {
          for (const variant of VARIANTS) {
            const name = `${movement} ${equipment} ${variant} (${ENVIRONMENT_LABEL[environment]})`;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            generated.push({
              name,
              muscleGroup: profile.group,
              primaryMuscle: profile.muscle,
              secondaryMuscles: profile.secondary,
              equipment,
              trainingEnvironment: environment,
              difficulty: DIFFICULTY_BY_VARIANT[variant],
              sets: profile.baseSets,
              reps: profile.baseReps,
              restSeconds: profile.baseRest,
              notes: `${movement} orientado a ${ENVIRONMENT_LABEL[environment]}. Variacion ${variant}.`,
            });
          }
        }
      }
    }
  }

  return generated;
}
