- Remove issuer?
- Refacto room guarded endpoints, only enable them in a context where the room and game is defined

## Refacto proposal: handle auth at the network level

User obtain a userId when they:
- createRoom
- joinRoom

User must use their userId to rejoin.

The userId is stored in Server -> Room -> User -> id

Any instance of secret can now be discarded