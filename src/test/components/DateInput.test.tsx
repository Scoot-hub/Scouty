/**
 * DateInput component tests
 * Covers: display format, ISO output, parsing, invalid input handling
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DateInput from '@/components/ui/date-input';

// Mock UiPreferences context
const mockDateFormat = vi.fn(() => 'DD/MM/YYYY');
vi.mock('@/contexts/UiPreferencesContext', () => ({
  useUiPreferences: () => ({ dateFormat: mockDateFormat() }),
}));

describe('DateInput', () => {
  beforeEach(() => {
    mockDateFormat.mockReturnValue('DD/MM/YYYY');
  });

  // ── Display ──────────────────────────────────────────────────────────────

  it('affiche une valeur ISO en format DD/MM/YYYY', () => {
    render(<DateInput value="2000-01-15" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('15/01/2000');
  });

  it('affiche une valeur ISO en format MM/DD/YYYY', () => {
    mockDateFormat.mockReturnValue('MM/DD/YYYY');
    render(<DateInput value="2000-01-15" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('01/15/2000');
  });

  it('affiche une valeur ISO en format YYYY-MM-DD', () => {
    mockDateFormat.mockReturnValue('YYYY-MM-DD');
    render(<DateInput value="2000-01-15" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('2000-01-15');
  });

  it('affiche vide quand value est vide', () => {
    render(<DateInput value="" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  // ── Parsing & output ─────────────────────────────────────────────────────

  it('convertit la saisie DD/MM/YYYY en ISO au blur', async () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '25/12/2023');
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('2023-12-25');
  });

  it('convertit la saisie MM/DD/YYYY en ISO au blur', async () => {
    mockDateFormat.mockReturnValue('MM/DD/YYYY');
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '12/25/2023');
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('2023-12-25');
  });

  it('appelle onChange("") quand le champ est vidé', async () => {
    const onChange = vi.fn();
    render(<DateInput value="2023-06-01" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('ne pas appeler onChange si la saisie ne peut pas être parsée', async () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'invalid');
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  // ── Validation ───────────────────────────────────────────────────────────

  it('rejette les dates impossibles (31 février)', async () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '31/02/2023');
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejette les années hors plage (< 1900)', async () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '01/01/1800');
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('affiche le bon placeholder selon le format DD/MM/YYYY', () => {
    render(<DateInput value="" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'jj/mm/aaaa');
  });

  it('affiche le bon placeholder selon le format MM/DD/YYYY', () => {
    mockDateFormat.mockReturnValue('MM/DD/YYYY');
    render(<DateInput value="" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'mm/dd/yyyy');
  });

  // ── Disabled ─────────────────────────────────────────────────────────────

  it('désactive le champ texte quand disabled=true', () => {
    render(<DateInput value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
