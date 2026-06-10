using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

public class UI_2DComponent : MonoBehaviour//, IPointerClickHandler, IBeginDragHandler, IEndDragHandler, IDragHandler
{
    private Canvas canvas;
    private RectTransform rectTrans;
    private CanvasGroup canvasGroup;
    private Image image;
    private RPD_2DComponent component;
    public RPD_2DComponent.componentType compType;
    public GameObject RPDcomp;
    /*[SerializeField]
    private Color AcrylicColour;
    [SerializeField]
    private Color MetalColour;
    [SerializeField]
    private Color DefaultColour;*/

    public enum MaterialType
    {
        Acrylic,
        Metal,
        None
    }

    public MaterialType material;

    public RPDComponent rpdComponent;
    
    private void Awake()
    {
        rectTrans = gameObject.GetComponent<RectTransform>();
        canvasGroup = gameObject.GetComponent<CanvasGroup>();
        canvas = gameObject.GetComponentInParent<Canvas>();
        if(gameObject.transform.Find("Mask") != null)
            image = gameObject.transform.Find("Mask").Find("Icon").GetComponent<Image>();
        component = RPDcomp.GetComponent<RPD_2DComponent>();
        compType = gameObject.GetComponent<UI_2DComponent>().compType;
        material = MaterialType.None;
        //selectedBorder = transform.GetChild(2).GetComponent<Image>();
    }

    private void Start()
    {
        //SetMaterial();
    }

    void Update()
    {
    }

    //UNUSED CODE
    #region

    //this should only set the Major Connector material
    //it may disable certain components that can't work with certain material
    /*public void SetMaterial()
    {
        if (material == MaterialType.Acrylic)
        {
            image.color = AcrylicColour;
            UI_ComponentDrag.Instance.GetComponent<Image>().color = AcrylicColour;
        }
        else if (material == MaterialType.Metal)
        {
            image.color = MetalColour;
            UI_ComponentDrag.Instance.GetComponent<Image>().color = MetalColour;
        }
        else
        {
            image.color = DefaultColour;
            UI_ComponentDrag.Instance.GetComponent<Image>().color = DefaultColour;
        }
    }

    public void OnBeginDrag(PointerEventData eventData)
    {

        return;

        
        canvasGroup.alpha = .5f;
        canvasGroup.blocksRaycasts = false;
        GlobalHelper.instance.SetMouseDown(true);
        UI_ComponentDrag.Instance.SetType(compType);
        UI_ComponentDrag.Instance.ShowDuplicateUI();
        StopAllCoroutines();

    }

    public void OnDrag(PointerEventData eventData)
    {
        
    }

    public void OnEndDrag(PointerEventData eventData)
    {
        return;

        GlobalHelper.instance.SetMouseDown(false);

        if(GlobalHelper.instance.CurrentTooth != null)
            GlobalHelper.instance.CurrentTooth.OnPointerUp();

        UI_ComponentDrag.Instance.HideDuplicateUI();

       
        canvasGroup.alpha = 1f;
        canvasGroup.blocksRaycasts = true;
      
        StartCoroutine(WaitReset());// reset drag type after 1 frame
        
    }

    IEnumerator WaitReset()
    {
        //yield return new WaitForSeconds(1) ;
        yield return null ;
        UI_ComponentDrag.Instance.ResetType();
    }

    public void OnPointerClick (PointerEventData eventData)
    {
        //SetComponent(true);
        ///UI_ComponentDrag.Instance.SetType(compType);
        UI_Component_Click.instance.SetCompType(compType);
    }*/
    #endregion
    /// <summary>
    /// Legacy function, unused.
    /// </summary>
    /// <param name="sprite"></param>
    public void SetSprite(Sprite sprite)
    {
        image.sprite = sprite;
        //print(sprite + "sprite");
    }
    /// <summary>
    /// Legacy function, unused.
    /// </summary>
    /// <param name="isSetting"></param>
    public void SetComponent(bool isSetting)
    {

        if (isSetting)
        {
            UI_Component_Click.instance.SetCompType(compType);
            UI_Component_Click.instance.SetCompType(rpdComponent);
            //onclick on a tooth component, set component and turn toggle off
        }

        else
            return;

        //component.compType = compType;
        //SetSprite(RPD_2DComponent.GetSprite(component.compType));
        //UI_ComponentDrag.Instance.SetSprite(RPD_2DComponent.GetSprite(component.compType));
        //SetMaterial();
        //UI_ComponentDrag.Instance.tag = this.tag;
        //print(compType);
    }
    /// <summary>
    /// Legacy function, unused.
    /// </summary>
    public void SetComponentThenPlace()
	{
        SetComponent(true);
        //do placing here
    }
}
