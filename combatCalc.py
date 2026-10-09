import math

def facto(n):
    return math.factorial(n)

def bin(k, n):
    return facto(n)/(facto(k)*facto(n-k))

def getWinProba(myHp, myAtk, myDiceModifier, otherHp, otherAtk, otherEvasion, nbDiceFace):
    nbHitToKillMe = math.ceil(myHp / otherAtk)
    nbHitToKillIt = math.ceil(otherHp / myAtk)
    probaHitIt = (nbDiceFace + myDiceModifier - otherEvasion + 1) / nbDiceFace
    # proba of nbHitToKillIt in at most nbHitToKillIt + nbHitToKillMe - 1 try
    nbAttemptsMax = nbHitToKillMe + nbHitToKillIt - 1
    winProba = 1
    for i in range(nbHitToKillIt):
        winProba -= bin(i, nbAttemptsMax) * probaHitIt ** i * (1-probaHitIt) ** (nbAttemptsMax - i)
    
    print("nbHitToKillMe", nbHitToKillMe, "nbHitToKillIt", nbHitToKillIt, "probaHit", probaHitIt, "winProba", winProba)
