using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using TMPro;

public class SelectionList_2DRPD : MonoBehaviour
{
    public List<RPD_2DComponent.componentType> componentsSel = new List<RPD_2DComponent.componentType>();
    public GameObject selectedComp;
    public TMP_Text selCompText;
    public Transform scrollview;
    GameObject self;
    TMP_Text selfText;

    // Start is called before the first frame update
    void Start()
    {
        
    }

    // Update is called once per frame
    void Update()
    {
        
    }
    /// <summary>
    /// Legacy Function, unused. Adds selected component into a list
    /// </summary>
    /// <param name="selection">Input of selected componentType</param>
    public void AddSelection(RPD_2DComponent.componentType selection)
    {
        //foreach (RPD_2DComponent.componentType comp in componentsSel)
        //{
            if (!componentsSel.Contains(selection))
            {
                componentsSel.Add(selection);
                Instantiate(selectedComp, scrollview);
                print(selection);
            }
        //}
    }
    /// <summary>
    /// Legacy Function, unused. Clears the selection list
    /// </summary>
    public void ClearList()
    {
        foreach (GameObject child in scrollview)
        {
            GameObject.Destroy(child);
        }

        componentsSel.Clear();

        //foreach (RPD_2DComponent.componentType comp in componentsSel)
        //{
        //}
    }
    /// <summary>
    /// Legacy Function, unused. Removes the specific selection from list
    /// </summary>
    /// <param name="selected">Input of selected componentType</param>
    public void RemoveFrom(GameObject selected)//RPD_2DComponent.componentType selection)
    {
        self = selected;
        //print(self.name);
        selfText = selected.transform.GetChild(1).GetComponent<TMP_Text>();
        print(selfText.text);
        //componentsSel.Remove(selection);
        componentsSel.Remove((RPD_2DComponent.componentType)System.Enum.Parse(typeof(RPD_2DComponent.componentType), selfText.text));
        //delete selected component
        GameObject.Destroy(self);
    }
}
