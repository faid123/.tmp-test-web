using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

public class UI_Component_Click : MonoBehaviour
{
    public static UI_Component_Click instance;
    public RPD_2DComponent.componentType compType = RPD_2DComponent.componentType.TypeNull;
    public RPDComponent currentComponent = null;
    public Transform error;

    [Header("All Toggles")]
    public Toggle Ibar;
    public Toggle Ybar;
    public Toggle Ubar;
    public Toggle Sbar;
    public Toggle Tbar;
    public Toggle Rbar;

    public Toggle RecipClasp;
    public Toggle RecipPlate;
    public Toggle RecipPlateAcrylic;

    public Toggle Hole;
    public Toggle Cross;
    public Toggle Stripe;
    public Toggle Tori;
    public Toggle Plate;
    public Toggle Flange;
    public Toggle FlangeMetal;
    
    public Toggle Onlay;

    void Awake()
    {
        if (instance == null)
            instance = this;
        else
            Destroy(this);
    }

    // Start is called before the first frame update
    void Start()
    {
        compType = RPD_2DComponent.componentType.TypeNull;
    }

    // Update is called once per frame
    void Update()
    {

    }
    /// <summary>
    /// Legacy Function. Sets the curret componentType
    /// </summary>
    /// <param name="currentcompType">Input of current componentType</param>
    public void SetCompType(RPD_2DComponent.componentType currentcompType)
    {
        Logger.Log(TypeLog.General, "Setting " + currentcompType);

        compType = currentcompType;
    }
    /// <summary>
    /// Sets the curret componentType
    /// </summary>
    /// <param name="currentComponent">Input of current RPDComponent</param>
    public void SetCompType(RPDComponent currentComponent)
    {
        Logger.Log(TypeLog.General, "Setting " + currentComponent);

        this.currentComponent = currentComponent;
    }
    /// <summary>
    /// Legacy Function. Checks on mouse click if there is a component selected, set to null and return true
    /// </summary>
    /// <param name="currentcompType">Input of componentType</param>
    /// <returns>True if there is a matching componentType</returns>
    public bool OnClickCheck(RPD_2DComponent.componentType currentcompType)
    {
        Logger.Log(TypeLog.General, "Clicked on " + currentcompType);

        if (compType == currentcompType)
        {
            compType = RPD_2DComponent.componentType.TypeNull; // selected and set to null
            return true;
        }
        else
        {
            return false;
        }
    }

    public Stage4_ComponentMenuUI_Control BarRetainerUIMenuCtrl;
    /// <summary>
    /// Resets all disabled Menu toggles/buttons back to ON
    /// </summary>
    public void ResetToggles()
    {
        BarRetainerUIMenuCtrl.TurnOnBtns();

        Ibar.isOn = false;
        Ybar.isOn = false;
        Ubar.isOn = false;
        Sbar.isOn = false;
        Tbar.isOn = false;
        Rbar.isOn = false;

        RecipClasp.isOn = false;
        RecipPlate.isOn = false;
        RecipPlateAcrylic.isOn = false;

        Hole.isOn = false;
        Cross.isOn = false;
        Stripe.isOn = false;
        Tori.isOn = false;
        Plate.isOn = false;
        Flange.isOn = false;
        FlangeMetal.isOn = false;

        Onlay.isOn = false;
    }
    /// <summary>
    /// Displays an Error UI
    /// </summary>
    public void CannotSet()
    {
        // Change UI here to cannot sets
        if(error != null)
        {
            error.gameObject.SetActive(true);
            error.GetComponent<Animator>().SetTrigger("Appear");
        }
    }
    /// <summary>
    /// Clears Error UI if it is on the screen
    /// </summary>
    public void CanSet()
    {
        // Change UI here to can set
        if (error != null)
            error.gameObject.SetActive(false);
    }
}
