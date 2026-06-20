# Example documentation (S-12: doc example strings are NOT leaks)

Set your API key in the environment:

```bash
export API_KEY=your-key-here
export DATABASE_URL=postgres://user:password@localhost:5432/db
```

The placeholder `your-key-here` is not a secret. Neither is the literal
`password` in the connection string example above (it is a docs placeholder).
