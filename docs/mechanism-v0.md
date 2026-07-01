# Mechanism v0

## Core idea

Instead of splitting a required budget equally among all participants, each participant privately declares how much they are willing to contribute.

The system does not reveal individual contributions.

It only reveals:

- whether the funding target has been reached
- how much funding is still missing

## Flow

### Step 1 — Problem definition

Community defines:

- problem to solve
- target amount
- deadline

Example:
Repair entrance door — 15,000 UAH

### Step 2 — Private contribution round

Each participant submits:

- minimum contribution
- comfortable contribution
- maximum contribution

or simply a chosen contribution amount.

### Step 3 — Aggregation

System computes total committed amount.

Possible outcomes:

#### Success
Total >= target

Funding goal achieved.

#### Failure
Total < target

System reveals only:

- funding gap
- optional recommendation for next round

Example:
Missing 3,200 UAH.

### Step 4 — Additional rounds

Participants may update contributions.

Rounds continue until:

- equilibrium reached
or
- no convergence
