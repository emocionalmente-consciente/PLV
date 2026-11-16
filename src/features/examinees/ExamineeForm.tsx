import { useForm } from 'react-hook-form';
import { type ExamineeInput, type ExamineeProblem, examineeProblems } from '../../data/repositories';
import { todayIso } from '../../domain/age';

const PROBLEM_FIELD: Record<ExamineeProblem, [keyof ExamineeInput, string]> = {
  'given-name-required': ['givenName', 'Escribe el nombre.'],
  'paternal-surname-required': ['paternalSurname', 'Escribe el apellido paterno.'],
  'birth-date-invalid': ['birthDate', 'Escribe una fecha de nacimiento válida, desde 1900 y no posterior a hoy.'],
};

interface Props {
  initial: ExamineeInput;
  label: string;
  submitLabel: string;
  onSave: (input: ExamineeInput) => Promise<void>;
}

export function ExamineeForm({ initial, label, submitLabel, onSave }: Props) {
  const { register, handleSubmit, reset, setError, formState } = useForm<ExamineeInput>({ defaultValues: initial });
  const { errors, isSubmitting } = formState;

  const submit = async (input: ExamineeInput): Promise<void> => {
    const problems = examineeProblems(input);
    for (const problem of problems) {
      const [field, message] = PROBLEM_FIELD[problem];
      setError(field, { message });
    }
    if (problems.length > 0) return;
    await onSave(input);
    reset(initial);
  };

  const fieldError = (field: keyof ExamineeInput) =>
    errors[field]?.message ? (
      <p role="alert" className="field-error">
        {errors[field].message}
      </p>
    ) : null;

  return (
    <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate className="stack" aria-label={label}>
      <label htmlFor="given-name">Nombre</label>
      <input id="given-name" autoComplete="off" {...register('givenName')} />
      {fieldError('givenName')}

      <label htmlFor="paternal-surname">Apellido paterno</label>
      <input id="paternal-surname" autoComplete="off" {...register('paternalSurname')} />
      {fieldError('paternalSurname')}

      <label htmlFor="maternal-surname">Apellido materno</label>
      <input id="maternal-surname" autoComplete="off" {...register('maternalSurname')} />

      <label htmlFor="sex">Sexo</label>
      <select id="sex" {...register('sex')}>
        <option value="F">Femenino</option>
        <option value="M">Masculino</option>
      </select>

      <label htmlFor="birth-date">Fecha de nacimiento</label>
      <input id="birth-date" type="date" max={todayIso()} {...register('birthDate')} />
      {fieldError('birthDate')}

      <button type="submit" disabled={isSubmitting}>
        {submitLabel}
      </button>
    </form>
  );
}
