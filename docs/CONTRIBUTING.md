# Contributing to Claudee Tracky

Thank you for your interest in improving Claudee Tracky! Contributions from the community help make this tool better for everyone.

## Code of Conduct

Please be respectful and constructive in all communication and interactions around this repository.

## Developing & Submitting Changes

1. **Fork the Repository** and create a feature branch off of `main`:
   ```bash
   git checkout -b feature/my-amazing-feature
   ```

2. **Backend Coding Standards**:
   - Write clean, idiomatic Rust.
   - Run `cargo fmt` to format your changes.
   - Run `cargo clippy` to check for common mistakes and optimizations.
   - Verify that all tests pass: `cargo test`.

3. **Frontend Coding Standards**:
   - Use TypeScript and type every variable (no `any` types).
   - Ensure the app is fully styled using Tailwind CSS v4 design tokens.
   - Check that the bundle builds cleanly: `npm run build`.

4. **Submit a Pull Request**:
   - Describe the problem solved and the implementation details.
   - Reference any related issue numbers.
   - Provide screenshots or screen recordings of UI changes if applicable.
