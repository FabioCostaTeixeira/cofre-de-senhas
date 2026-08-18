import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ModalForm } from '@/components/ModalForm';

afterEach(() => cleanup());

describe('ModalForm', () => {
  it('não renderiza nada quando isOpen é false', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ModalForm title="Título" isOpen={false} onClose={onClose}>
        <p>Conteúdo</p>
      </ModalForm>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza children, title, role=dialog e aria-modal=true quando isOpen é true', () => {
    const onClose = vi.fn();
    render(
      <ModalForm title="Meu Título" isOpen onClose={onClose}>
        <p>Conteúdo do formulário</p>
      </ModalForm>,
    );
    expect(screen.getByText('Meu Título')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo do formulário')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('Escape chama onClose quando isOpen é true e não está carregando', () => {
    const onClose = vi.fn();
    render(
      <ModalForm title="Título" isOpen onClose={onClose}>
        <p>Conteúdo</p>
      </ModalForm>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape NÃO chama onClose quando isLoading é true', () => {
    const onClose = vi.fn();
    render(
      <ModalForm title="Título" isOpen onClose={onClose} isLoading>
        <p>Conteúdo</p>
      </ModalForm>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clicar no backdrop chama onClose; clicar dentro do painel não chama', () => {
    const onClose = vi.fn();
    render(
      <ModalForm title="Título" isOpen onClose={onClose}>
        <p>Conteúdo</p>
      </ModalForm>,
    );
    fireEvent.click(screen.getByText('Conteúdo'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('botão X chama onClose quando não está carregando', () => {
    const onClose = vi.fn();
    render(
      <ModalForm title="Título" isOpen onClose={onClose}>
        <p>Conteúdo</p>
      </ModalForm>,
    );
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('botão X fica inerte (não chama onClose) quando isLoading é true', () => {
    const onClose = vi.fn();
    render(
      <ModalForm title="Título" isOpen onClose={onClose} isLoading>
        <p>Conteúdo</p>
      </ModalForm>,
    );
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('botão de submit fica disabled quando isLoading é true', () => {
    const onClose = vi.fn();
    render(
      <ModalForm title="Título" isOpen onClose={onClose} isLoading submitLabel="Salvar">
        <p>Conteúdo</p>
      </ModalForm>,
    );
    expect(screen.getByRole('button', { name: '...' })).toBeDisabled();
  });
});
