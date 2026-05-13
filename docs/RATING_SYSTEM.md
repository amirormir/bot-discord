# Système de Classement

Le bot utilise un **rating Glicko-2** en interne (~1500 sur l'échelle native) que tu ne vois jamais directement. À l'écran, tu vois deux choses : un **score 0-100** et un **tier**.

## Les tiers

7 paliers, dans l'ordre :

| Tier   | Display | Idée |
|--------|---------|------|
| Seed   | 0-14    | Tu démarres ou tu te cherches |
| Sprout | 15-29   | Tu commences à pousser (point de départ : 25) |
| Bloom  | 30-44   | Tu prends forme |
| Thorn  | 45-59   | Tu piques quand il faut |
| Crown  | 60-74   | Solide top du serveur |
| Eden   | 75-89   | Élite |
| Heaven | 90-100  | Sommet |

Chaque tier est sous-divisé en **III → II → I** (5 points par sous-palier). Exemple : *Bloom II = 35-39*.

## Placements

Tes **10 premières games** sont des placements. Pendant ces parties :
- Pas de tier officiel ni de score affiché
- Le rating bouge **beaucoup** à chaque match (RD initial élevé)
- À la fin, tu es placé selon ton vrai niveau (Seed → Eden possible)

Tu gardes une mention *(provisoire)* tant que ton rating n'est pas assez stable.

## Comment le rating bouge

Glicko-2 prend en compte **l'incertitude** du rating (le RD, Rating Deviation) :
- **Nouveau joueur** (RD ~200) → bouge ~3-4× plus qu'un vétéran à chaque match
- **Vétéran régulier** (RD ~50) → varie peu, son rating est jugé fiable
- **Joueur fort** dans une équipe faible qui bat une équipe forte → **gagne beaucoup**
- **Joueur faible** dans une équipe forte qui bat une équipe faible → **gagne peu**

Plus de "punition du fort" : tous les joueurs d'une même équipe sont traités face à un **avatar moyen** de l'équipe adverse. Le delta dépend de ton propre RD, pas du niveau de tes coéquipiers.

## MVP / ACE (arbitre)

À la fin de chaque partie, l'**arbitre** (admin ou rôle *Arbitre*) peut désigner :

- un **MVP** dans l'équipe gagnante → **+10 %** sur le gain de rating
- un **ACE** dans l'équipe perdante → **−10 %** sur la perte de rating

Les bonus sont appliqués au moment de la finalisation. L'arbitre peut aussi cliquer sur **Passer** s'il n'y a ni MVP ni ACE à désigner. Les joueurs eux-mêmes ne peuvent ni se désigner ni annuler la partie.

## Decay (inactivité)

Au-delà de **7 jours sans jouer**, ton RD remonte progressivement. Quand le RD passe au-dessus de **150**, tu sors du leaderboard public jusqu'à ce que tu rejoues. Aucun rating n'est perdu — c'est juste l'incertitude qui augmente.

## Leaderboard

Pour figurer dans le classement, il faut :
- Avoir terminé les placements (10 games)
- Avoir un RD ≤ 120 (rating jugé suffisamment fiable)

Cela empêche les joueurs avec 4 games de squatter le top 10.

## Conversion rating ↔ display

```
display = round((rating - 500) / 20)
```

- rating 500  → 0    (fond du Seed)
- rating 1000 → 25   (Sprout — point de départ)
- rating 1500 → 50   (Thorn)
- rating 2000 → 75   (Eden)
- rating 2500 → 100  (Heaven, top)
