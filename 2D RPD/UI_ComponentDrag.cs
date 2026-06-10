//Controls the Dragging of the 2D RPD Components

using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

public class UI_ComponentDrag : MonoBehaviour
{
    public static UI_ComponentDrag Instance { get; private set; }

    private Canvas canvas;
    private RectTransform rectTrans;
    private RectTransform parentRectTrans;
    private CanvasGroup canvasGroup;
    private Image image;
    public Transform error;
    private GameObject draggedComponent;

    public RPD_2DComponent.componentType compType;


    private void Awake()
    {
        Instance = this;

        rectTrans = GetComponent<RectTransform>();
        canvasGroup = GetComponent<CanvasGroup>();
        canvas = GetComponentInParent<Canvas>();
        image = GetComponent<Image>();
        parentRectTrans = GetComponentInParent<RectTransform>();

        error = this.gameObject.transform.GetChild(0);

        HideDuplicateUI();
    }

    private void Update()
    {
        if(compType!= RPD_2DComponent.componentType.TypeNull)
        UpdatePosition();
    }
    /// <summary>
    /// Legacy Function, unused. Moves dragged object with mouse position
    /// </summary>
    private void UpdatePosition()
    {
        rectTrans.transform.position = Input.mousePosition;
    }
    /// <summary>
    /// Legacy Function, unused. Sets the sprite of the dragged object
    /// </summary>
    /// <param name="componentSprite">Input of selected compnent sprite</param>
    public void SetSprite(Sprite componentSprite)
    {
        image.sprite = componentSprite;
        print(componentSprite + "sprite");
    }

    /// <summary>
    /// Legacy Function, unused. Sets the componentType of the dragged object
    /// </summary>
    /// <param name="type">Input of selected componentType</param>
    public void SetType(RPD_2DComponent.componentType type)
    {
        compType = type;
    }
    /// <summary>
    /// Legacy Function, unused. Resets the componentType
    /// </summary>
    public void ResetType()
    {
        compType = RPD_2DComponent.componentType.TypeNull;
    }
    /// <summary>
    /// Legacy Function, unused. 
    /// </summary>
    public void HideDuplicateUI()
    {
        canvasGroup.alpha = 0f;
        error.gameObject.SetActive(false);
        rectTrans.transform.position = new Vector3(10000,10000);

    }
    /// <summary>
    /// Legacy Function, unused. 
    /// </summary>
    public void ShowDuplicateUI()
    {
        canvasGroup.alpha = 1f;


        UpdatePosition();
    }
    /// <summary>
    /// Legacy Function, unused. Displays an Error UI
    /// </summary>
    public void CannotSet()
    {
        // Change UI here to cannot sets
        error.gameObject.SetActive(true);
    }
    /// <summary>
    /// Legacy Function, unused. Clears Error UI if it is on the screen
    /// </summary>
    public void CanSet()
    {
        // Change UI here to can set
        error.gameObject.SetActive(false);
    }
}
