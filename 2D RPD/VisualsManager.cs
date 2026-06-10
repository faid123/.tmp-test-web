using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public static class VisualsManager
{
    //array of 16 dictionaries for each jaw, representing each tooth for said jaw
    //key for each entry in the dictionary represents one component being shown
    //value for each entry in the dictionary is the list of sprite gameobjects for that tooth's component
    static Dictionary<RPDComponent, List<GameObject>>[] upperJawVisuals = new Dictionary<RPDComponent, List<GameObject>>[16];
    static Dictionary<RPDComponent, List<GameObject>>[] lowerJawVisuals = new Dictionary<RPDComponent, List<GameObject>>[16];
    /// <summary>
    /// Register a visual to the inputted tooth
    /// </summary>
    /// <param name="fdiToothID">Input of Tooth FDI ID</param>
    /// <param name="rpdComponent">Input of RPD Component</param>
    /// <param name="spriteGameobjects">Input of sprite object to add</param>
    public static void RegisterVisuals(int fdiToothID, RPDComponent rpdComponent, params GameObject[] spriteGameobjects)
    {
        Dictionary<RPDComponent, List<GameObject>> visualsDict = GetDictionary(fdiToothID);

        if (visualsDict.TryGetValue(rpdComponent, out List<GameObject> spriteGOList))
            spriteGOList.AddRange(spriteGameobjects);
        else
            visualsDict.Add(rpdComponent, new List<GameObject>(spriteGameobjects));
    }
    /// <summary>
    /// Destroy singular visual
    /// </summary>
    /// <param name="fdiToothID">Input of Tooth FDI ID</param>
    /// <param name="rpdComponent">Input of RPD Component</param>
    public static void DestroyVisuals(int fdiToothID, RPDComponent rpdComponent)
    {
        Dictionary<RPDComponent, List<GameObject>> visualsDict = GetDictionary(fdiToothID);

        if (!visualsDict.TryGetValue(rpdComponent, out List<GameObject> visuals))
        {
            Logger.LogError(TypeLogError.General, $"Unable to destroy visuals for {rpdComponent}. Visuals dictionary not found.");
            return;
        }

        //remove component from visuals dictionary array
        visualsDict.Remove(rpdComponent);

        //loop through list and destroy objects
        for (int i = visuals.Count - 1; i >= 0; i--)
        {
            GameObject spriteGameObject = visuals[i];

            //remove from list before destroying
            visuals.Remove(spriteGameObject);

            //destroy sprite gameobject
            Object.Destroy(spriteGameObject);
        }
    }

    /// <summary>
    /// Get Visuals of the inputted tooth and rpdcomponent
    /// </summary>
    /// <param name="fdiToothID">Input of Tooth FDI ID</param>
    /// <param name="rpdComponent">Input of RPD component</param>
    /// <returns>dictionary pair of inputted RPD component</returns>
    public static List<GameObject> GetVisuals(int fdiToothID, RPDComponent rpdComponent)
    {
        Dictionary<RPDComponent, List<GameObject>> visualsDict = GetDictionary(fdiToothID);

        return visualsDict[rpdComponent];
    }
    /// <summary>
    /// Gets Dictionary of inputted tooth FDI ID
    /// </summary>
    /// <param name="fdiToothID">Input of tooth FDI ID</param>
    /// <returns>array of jaw visuals attached to tooth</returns>
    static Dictionary<RPDComponent, List<GameObject>> GetDictionary(int fdiToothID)
    {
        int toothID = Utils.FDINumberingToPatchID(fdiToothID, out Jaw_Type jawType);

        Dictionary<RPDComponent, List<GameObject>>[] array;

        if (jawType == Jaw_Type.upper_jaw)
            array = upperJawVisuals;
        else
            array = lowerJawVisuals;

        if (array[toothID] == null)
            array[toothID] = new Dictionary<RPDComponent, List<GameObject>>();

        return array[toothID];
    }
    /// <summary>
    /// Handles clearing of all visuals in the inputted jaw
    /// </summary>
    /// <param name="jawType">Input of Jaw Type</param>
    public static void DestroyAllVisuals(Jaw_Type jawType)
    {
        Dictionary<RPDComponent, List<GameObject>>[] dummyRef = null;
        ref Dictionary<RPDComponent, List<GameObject>>[] array = ref dummyRef;

        if (jawType == Jaw_Type.upper_jaw)
            array = ref upperJawVisuals;
        else
            array = ref lowerJawVisuals;

        foreach (Dictionary<RPDComponent, List<GameObject>> dict in array)
        {
            if (dict == null)
                continue;

            foreach (KeyValuePair<RPDComponent, List<GameObject>> entry in dict)
            {
                foreach(GameObject spriteGameObject in entry.Value)
                {
                    Object.Destroy(spriteGameObject);
                }
            }

            dict.Clear();
        }
    }

    public static void DestroyAllVisuals(int fdiToothID)
    {
        Dictionary<RPDComponent, List<GameObject>> visualsDict = GetDictionary(fdiToothID);

        //cache components because dict will be modified, can't be iterated through
        List<RPDComponent> components = new List<RPDComponent>();

        foreach (KeyValuePair<RPDComponent, List<GameObject>> entry in visualsDict)
		{
            components.Add(entry.Key);
		}

        foreach(RPDComponent component in components)
		{
            DestroyVisuals(fdiToothID, component);
		}
    }
}
