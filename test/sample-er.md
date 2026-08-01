# Sample ER diagram (test fixture)

Open this note in your test vault, select the diagram body inside the
`mermaid` block below (or just run the command with your cursor in the note —
it falls back to the whole file), then run **"Convert selected Mermaid ER
diagram to Excalidraw"**.

This fixture deliberately exercises:

- entity attribute blocks with `PK` / `FK` / `UK` keys and a quoted comment
- all four cardinality glyphs (`||`, `|o`, `o{`, `}o`) on both sides
- identifying (`--`) and non-identifying (`..`) relationships
- a relationship with and without a label

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER ||--o| ADDRESS : "ships to"
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "ordered as"
    PRODUCT }o--o{ CATEGORY : "belongs to"
    ORDER }o..o| COUPON : uses

    CUSTOMER {
        string id PK
        string email UK "login identifier"
        string name
        string phone
    }

    ADDRESS {
        string id PK
        string customerId FK
        string line1
        string city
        string postcode
    }

    ORDER {
        string id PK
        string customerId FK
        string couponId FK
        datetime placedAt
        string status
    }

    LINE_ITEM {
        string orderId FK
        string productId FK
        int quantity
        decimal unitPrice
    }

    PRODUCT {
        string sku PK
        string name
        decimal price
    }

    CATEGORY {
        string id PK
        string name
    }

    COUPON {
        string code PK
        decimal discount
        datetime expiresAt
    }
```

## Minimal fixture

A tiny one for quick smoke tests:

```mermaid
erDiagram
    USER ||--o{ POST : writes
    USER {
        string id PK
        string handle UK
    }
    POST {
        string id PK
        string authorId FK
        string body
    }
```

## Edge cases (test malformed / unsupported handling)

Each block below exercises a different failure mode. Open this note in
**Reading view** and check the described behavior.

### 1. Malformed relationship → renders partial + ⚠ badge

`AUTHOR |--o{ REVIEW` is missing a bar. **Expected:** renders `AUTHOR`, `BOOK`,
`REVIEW` with the `writes` edge, plus a **⚠ 1** badge (top-left). Click it to see
the skipped line.

```mermaid
erDiagram
    AUTHOR ||--o{ BOOK : writes
    AUTHOR |--o{ REVIEW : receives
    AUTHOR {
        string id PK
        string name
    }
    BOOK {
        string id PK
        string title
    }
    REVIEW {
        string id PK
        int rating
    }
```

### 2. Unsupported syntax (single-line blocks) → renders + ⚠ badge

Single-line `A { ... }` blocks aren't parsed (only multi-line blocks are).
**Expected:** boxes `A` and `B` with the edge but **no attributes**, plus a
**⚠ 2** badge listing both single-line blocks.

```mermaid
erDiagram
    A ||--o{ B : rel
    A { string id PK }
    B { string id PK }
```

### 3. Unclosed block → recovers, no warning

`ACCOUNT {` is never closed before `TX {`. **Expected:** Merefolk closes the
block and renders both entities fully — **no ⚠ badge**. (Note: native Mermaid
would error on this; Merefolk recovers leniently.)

```mermaid
erDiagram
    ACCOUNT ||--o{ TX : has
    ACCOUNT {
        string id PK
        string owner
    TX {
        string id PK
        decimal amount
    }
```

### 4. Comments + directives → ignored, no warning

`%%` comments and `%%{init}%%` directives are ignored (not counted as skipped).
**Expected:** clean render, **no ⚠ badge**.

```mermaid
erDiagram
    %% this comment is ignored
    %%{init: {"theme": "dark"}}%%
    USER ||--o{ SESSION : opens
    USER {
        string id PK
    }
    SESSION {
        string id PK
    }
```

### 5. Totally unparseable → falls back to native Mermaid

No valid entities, so Merefolk bows out and lets Obsidian render the block —
which shows **Mermaid's own error**. **Expected:** a Mermaid error box, no
Merefolk render or buttons.

```mermaid
erDiagram
    this is not valid !!!
    ??? nonsense
```

### 6. Non-ER diagram → left alone

A flowchart is valid Mermaid but not an ER diagram, so Merefolk never touches it.
**Expected:** a normal Mermaid flowchart, no Merefolk render or buttons.

```mermaid
flowchart TD
    A[Start] --> B{Decision}
    B -->|yes| C[Do it]
    B -->|no| D[Skip]
```

