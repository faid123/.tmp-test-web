using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

[System.Serializable]
public class ToothSelection
{
    public string ToothAction;
    public UnityEvent ToothClick;
}


public class GenericToothSelection : MonoBehaviour
{
    [SerializeField]
    List<ToothSelection> ToothSelectionList = new List<ToothSelection>();
    /// <summary>
    /// Handles calling of event from ToothSelectionList
    /// </summary>
    /// <param name="selection"></param>
    public void ToothActionClick(int selection)
    {
        if (RPDManager.instance.useNew2DSystem)
            return;

        if (selection > ToothSelectionList.Count)
            return;

        if(ToothSelectionList[selection].ToothClick != null)
            ToothSelectionList[selection].ToothClick.Invoke();
    }
}
