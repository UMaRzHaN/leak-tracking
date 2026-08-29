import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const AddProjectForm = (await import("./AddProjectForm")).default;

function renderForm() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const result = render(
    <AddProjectForm onConfirm={onConfirm} onCancel={onCancel} />,
  );
  const name = screen.getByLabelText("Name");
  return { ...result, onConfirm, onCancel, name };
}

describe("AddProjectForm", () => {
  it("предлагает все три типа проекта", () => {
    renderForm();

    expect(screen.getByText("Upstream")).toBeInTheDocument();
    expect(screen.getByText("Midstream")).toBeInTheDocument();
    expect(screen.getByText("Downstream")).toBeInTheDocument();
  });

  it("не даёт создать проект без типа", () => {
    const { onConfirm } = renderForm();

    // Кнопка заблокирована, пока тип не выбран: тип — единственное, без чего
    // проект не собрать, имя же не обязательно.
    expect(screen.getByText("Create")).toBeDisabled();
    fireEvent.click(screen.getByText("Create"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("передаёт имя и тип, обрезав пробелы по краям", () => {
    const { onConfirm, name } = renderForm();

    fireEvent.change(name, { target: { value: "  Тенгиз Q1  " } });
    fireEvent.click(screen.getByText("Upstream"));
    fireEvent.click(screen.getByText("Create"));

    expect(onConfirm).toHaveBeenCalledWith("Тенгиз Q1", "upstream");
  });

  it("показывает, как проект ляжет папкой на устройстве", () => {
    const { name } = renderForm();

    // До ввода показывать нечего.
    expect(screen.getByText("—")).toBeInTheDocument();

    fireEvent.change(name, { target: { value: "Тенгиз Q1 2026" } });

    // Имя папки выводится из названия, и увидеть его нужно до создания:
    // переименовать папку потом нельзя.
    expect(screen.getByText("Тенгиз_Q1_2026")).toBeInTheDocument();
  });

  it("создаёт по Enter и закрывается по Escape", () => {
    const { onConfirm, onCancel, name } = renderForm();

    fireEvent.click(screen.getByText("Midstream"));
    fireEvent.change(name, { target: { value: "Труба" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith("Труба", "midstream");

    fireEvent.keyDown(name, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("Enter без выбранного типа объясняет, чего не хватает", () => {
    // Клавиатура обходит заблокированную кнопку, поэтому проверка нужна и
    // здесь — иначе Enter просто ничего не делал бы, молча.
    const { onConfirm, name } = renderForm();

    fireEvent.keyDown(name, { key: "Enter" });

    expect(screen.getByText("Select a project type")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("выбор типа снимает сообщение о том, что тип не выбран", () => {
    const { name } = renderForm();
    fireEvent.keyDown(name, { key: "Enter" });
    expect(screen.getByText("Select a project type")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Downstream"));

    expect(screen.queryByText("Select a project type")).not.toBeInTheDocument();
  });

  it("отмена ничего не создаёт", () => {
    const { onConfirm, onCancel } = renderForm();

    fireEvent.click(screen.getByText("Cancel"));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
