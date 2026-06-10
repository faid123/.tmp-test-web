//Slots for components to go into in 2D RPD Component

using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

public class UI_ComponentSlots : MonoBehaviour
{
    private Image image;
    private Color imageColour;

    List<GameObject> SpawnGO = new List<GameObject>();

    private void Awake()
    {
        image = GetComponentInChildren<Image>();
        imageColour = image.color;
        imageColour.a = 0f;
    }

    /*public void OnDrop(PointerEventData eventData)
    {
        UI_ComponentDrag.Instance.HideDuplicateUI();
        //instanciate component here under parent as a child
    }*/
    /// <summary>
    /// Legacy function, unused
    /// </summary>
    /// <param name="collision"></param>
    void OnTriggerEnter2D(Collider2D collision)
    {
        //print("heeloe?");
        if (collision.gameObject.tag == this.tag || collision.gameObject.tag == "BothJaw")
        {
            print("collided same");

            //Debug.LogError(collision.gameObject.name);
        }

        else
        {
            UI_ComponentDrag.Instance.error.gameObject.SetActive(true);
            print("collided different error");
        }
    }
    /// <summary>
    /// Legacy function, unused
    /// </summary>
    /// <param name="collision"></param>
    void OnTriggerExit2D(Collider2D collision)
    {
        if (collision != null)
        UI_ComponentDrag.Instance.error.gameObject.SetActive(false);
        //print("BYEEE");

        //Spawns the GO prefab onto the tooth slot
        if(!GlobalHelper.instance.GetMouseDown())
        {
            //Debug.LogError("Set "  + collision.GetComponent<UI_ComponentDrag>().compType);

            if (collision.GetComponent<UI_ComponentDrag>().compType == RPD_2DComponent.componentType.TypeNull)
                return;

             GameObject GO = new GameObject();
             GO.AddComponent<RectTransform>();
             GO.AddComponent<UnityEngine.UI.Image>();


             GO.GetComponent<Image>().sprite = RPD_2DComponent.GetSprite(collision.GetComponent<UI_ComponentDrag>().compType);

             GO.transform.parent = this.transform;
             GO.GetComponent<RectTransform>().localPosition = Vector3.zero;
             GO.GetComponent<Image>().color = collision.GetComponent<Image>().color;

            SpawnGO.Add(GO);
        }
    }
    /// <summary>
    /// Legacy function, unused
    /// </summary>
    public void ResetDrawing()
    {
        foreach(GameObject go in SpawnGO)
        {
            Destroy(go);
        }
    }
}
