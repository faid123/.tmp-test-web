using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

public class RetainerSlots : MonoBehaviour, IPointerClickHandler
{    
    // Start is called before the first frame update
    void Start()
    {
        
    }

    // Update is called once per frame
    void Update()
    {
        
    }
    /// <summary>
    /// Unused.
    /// </summary>
    /// <param name="collision"></param>
    void OnTriggerEnter2D(Collider2D collision)
    {
        if (collision.name == "DragUI_Item")
        {
            if (collision.tag == "Ball")//collision.GetComponent<UI_ComponentDrag>().compType == RPD_2DComponent.componentType.)
            {
                collision.GetComponent<UI_ComponentDrag>().CanSet();
            }

            else
            {
                collision.GetComponent<UI_ComponentDrag>().CannotSet();
            }
        }
    }

    public void OnPointerUp()
    {
    }

    private void OnTriggerExit2D(Collider2D collision)
    {
        UI_ComponentDrag.Instance.CanSet();
    }

    public void OnPointerClick(PointerEventData eventData)
    {

    }
}
