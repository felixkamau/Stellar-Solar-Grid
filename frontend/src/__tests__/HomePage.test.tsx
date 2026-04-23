import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders the app title", () => {
    render(<HomePage />);
    expect(screen.getByText("Stellar SolarGrid")).toBeInTheDocument();
  });

  it("renders dashboard links", () => {
    render(<HomePage />);
    expect(screen.getByRole("link", { name: /user dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /provider dashboard/i })).toBeInTheDocument();
  });
});
