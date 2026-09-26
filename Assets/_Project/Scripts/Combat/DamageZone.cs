namespace PointDeRupture.Combat
{
    /// <summary>
    /// Zones de dégâts. L'ordre est figé : il sert d'index dans les tableaux de
    /// multiplicateurs et voyage sur le réseau. On n'insère jamais au milieu.
    /// </summary>
    public enum DamageZone
    {
        Chest = 0,
        Head = 1,
        Stomach = 2,
        Arms = 3,
        Legs = 4
    }
}
